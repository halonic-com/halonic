import { logLine, minutesSince, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";

/**
 * CI reruns and cancels (MERGER.md §5, HAL-16528, HAL-17685): cancelled
 * `ci-ok` reruns, known infra flakes on fast-track pull requests, stalled
 * front groups, and queued runs nobody needs any more.
 */

/** Reruns pause while a merge-group job has waited longer than this for a runner. */
export const rerunPauseMinutes = 1;
/** A head is rerun at most once in this many minutes. */
export const rerunEveryMinutes = 60;
/** An entry this long in `AWAITING_CHECKS` with every run finished is stalled. */
export const stallMinutes = 30;
/** Only the first entries of the queue are checked for a stall. */
export const stallFront = 3;
/** Queued runs older than this are GitHub ghosts that can't be cancelled (409). */
export const staleRunHours = 24;
/**
 * A queued group run younger than this is never cancelled: the pass reads
 * the queue before the run list, so a group GitHub rebuilt in between looks
 * gone (run 45600263634, 25 Nov, went green and merged).
 */
export const staleRunMinMinutes = 3;

/** Why reruns pause this pass, or undefined. */
export function rerunPause(context: PassContext): string | undefined {
  const wait = context.snapshot.runnerWaitMinutes;
  if (wait === null) {
    return "could not read merge-group jobs";
  }
  return wait > rerunPauseMinutes
    ? `merge-group jobs waiting > ${rerunPauseMinutes} min for a runner (max ${wait.toFixed(1)} min)`
    : undefined;
}

/**
 * Up to `rerunsPerPass` pull requests whose newest `ci-ok` was cancelled get
 * their CI run rerun, each head at most once an hour; ones Liam approved
 * first, then the oldest. No approval needed; never a red one.
 */
export function cancelledReruns(context: PassContext, rows: readonly GateRow[]): void {
  const { state, settings } = context;
  const recent = (key: string, head: string) => {
    const was = state.reran[key];
    return (
      was !== undefined && was.head === head && minutesSince(context, was.at) < rerunEveryMinutes
    );
  };
  const liam = (row: GateRow) =>
    row.approval?.ok === true && row.approval.julian !== true && row.approval.nora !== true ? 1 : 0;
  const candidates = rows
    .filter(
      (row) =>
        row.entry === undefined &&
        row.paperclip &&
        !row.pull.draft &&
        row.pull.mergeable === "MERGEABLE" &&
        row.changeRequest === null &&
        row.ci.state === "cancelled" &&
        !recent(String(row.pull.number), row.pull.head),
    )
    .sort((a, b) => liam(b) - liam(a) || a.pull.createdAt.localeCompare(b.pull.createdAt));
  let sent = 0;
  for (const row of candidates) {
    if (sent >= settings.rerunsPerPass) {
      break;
    }
    const run = row.pull.ciRun;
    if (run === null) {
      logLine(context, "rerun", `skipped #${row.pull.number}: no CI run on head (needs a push)`);
      continue;
    }
    if (run.status !== "completed") {
      logLine(context, "rerun", `skipped #${row.pull.number}: CI already ${run.status}`);
      continue;
    }
    context.actions.push({
      kind: "rerun",
      runId: run.id,
      why: `#${row.pull.number} ci-ok cancelled`,
    });
    state.reran[String(row.pull.number)] = {
      head: row.pull.head,
      at: context.now.toISOString(),
      run: run.id,
    };
    sent += 1;
  }
}

const setupStep = /^(Set up job|Initialize containers|Complete job|Post )/;
const cancelledBase = /merge base's tests job ended as cancelled|Rerun the failed jobs/i;

/**
 * An approved fast-track pull request whose red `ci-ok` comes from a known
 * infra flake gets its failed jobs rerun once per head: the merge base's
 * tests ended cancelled, or every failed job died in runner setup steps.
 * Real test or guard failures are the author's.
 */
export function flakeReruns(
  context: PassContext,
  rows: readonly GateRow[],
  fast: ReadonlySet<number>,
): void {
  const { state } = context;
  for (const row of rows) {
    const { number, head } = row.pull;
    const key = String(number);
    const run = row.pull.ciOkRun;
    if (
      !fast.has(number) ||
      row.entry !== undefined ||
      row.pull.draft ||
      row.ci.state !== "failure" ||
      row.approval?.ok !== true ||
      state.reranFlake[key]?.head === head ||
      run === null ||
      run.headSha !== head
    ) {
      continue;
    }
    const base = cancelledBase.test(run.ciOkLog);
    const others = run.failedJobs.filter((job) => job.id !== run.ciOkJobId);
    const infra =
      others.length > 0 &&
      others.every((job) => job.failedSteps.every((step) => setupStep.test(step)));
    if (!base && !infra) {
      logLine(context, "flake", `skipped #${number}: ci-ok red, not a known flake`);
      continue;
    }
    const why = base ? "base tests cancelled" : "runner/setup error";
    context.actions.push({ kind: "rerun-failed-jobs", runId: run.runId, why: `#${number} ${why}` });
    state.reranFlake[key] = { head, at: context.now.toISOString(), run: run.runId };
    logLine(context, "flake", `FLAKE_RERUN #${number}(run ${run.runId}, ${why})`);
  }
}

/**
 * A front entry waiting for checks for over 30 minutes whose merge-group
 * runs have all finished will never get `ci-ok`: rerun its runs that didn't
 * pass (no dequeue, no churn).
 */
export function stalledGroups(context: PassContext): void {
  const front = context.snapshot.queue
    .filter((entry) => entry.position <= stallFront)
    .filter(
      (entry) =>
        entry.state === "AWAITING_CHECKS" && minutesSince(context, entry.enqueuedAt) > stallMinutes,
    );
  for (const entry of front) {
    const runs = context.snapshot.mergeGroupRuns.filter((run) => run.headSha === entry.groupHead);
    if (runs.length === 0 || runs.some((run) => run.status !== "completed")) {
      continue;
    }
    logLine(context, "stall", `stalled #${entry.number}`);
    for (const run of runs.filter((each) => each.conclusion !== "success")) {
      context.actions.push({
        kind: "rerun",
        runId: run.id,
        why: `stalled group of #${entry.number}`,
      });
    }
  }
}

/**
 * Cancels queued merge-group runs whose commit is no longer a current group,
 * at least 3 minutes and less than a day old, and queued pull request runs
 * on a head that was pushed over (board, 20 Nov).
 */
export function staleRuns(context: PassContext): void {
  const { snapshot } = context;
  const groups = new Set(
    snapshot.queue.flatMap((entry) => (entry.groupHead === null ? [] : [entry.groupHead])),
  );
  const young = (at: string) => minutesSince(context, at) < staleRunHours * 60;
  const settled = (at: string) => minutesSince(context, at) >= staleRunMinMinutes;
  for (const run of snapshot.mergeGroupRuns) {
    if (
      run.status === "queued" &&
      young(run.createdAt) &&
      settled(run.createdAt) &&
      !groups.has(run.headSha)
    ) {
      context.actions.push({
        kind: "cancel-run",
        runId: run.id,
        why: "merge group no longer in the queue",
      });
    }
  }
  const heads = new Map((snapshot.open ?? []).map((pull) => [pull.branch, pull.head]));
  for (const run of snapshot.queuedPullRuns) {
    const head = heads.get(run.branch);
    if (run.status === "queued" && head !== undefined && head !== run.headSha) {
      context.actions.push({
        kind: "cancel-run",
        runId: run.id,
        why: `superseded head on ${run.branch}`,
      });
    }
  }
}
