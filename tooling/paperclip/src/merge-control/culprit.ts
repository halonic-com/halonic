import { lastPushOf } from "./approval.ts";
import { failedGroupFacts, wakeAuthor } from "./author-wake.ts";
import { commentOnce, logLine, minutesSince, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";
import { groupCulprit } from "./main-broken.ts";
import { refusedOnly } from "./refused.ts";
import type { GroupRun } from "./snapshot.ts";
import { texts } from "./texts.ts";

/**
 * Failed merge groups (MERGER.md §6). A group that ends `cancelled` can hide
 * a failed job, so those count too. The group's own pull request, once
 * GitHub has taken it out, is the likely culprit: it is held until it has a
 * new head (rule 13), and told once which job failed. A cancelled group with
 * no failed job lets its pull request back in once (Chief, HAL-10, 24 Nov);
 * a second one holds it. A group that failed only on files its pull request
 * doesn't touch holds nothing: main is broken (`main-broken.ts`); one that
 * failed on files a pull request ahead of it in the group chain touches holds
 * that one. Nor does a group whose jobs the runner hook refused (`refused.ts`).
 */

/** Failed groups are read this far back. */
export const failedGroupHours = 3;
/** A failure older than this sets no new hold. */
export const culpritWindowMinutes = 60;
/** Seen run ids kept in state. */
export const keptSeenRuns = 500;

/** The pull request number a merge-group branch names. */
export function groupPull(branch: string): number | undefined {
  const match = /pr-(\d+)-/.exec(branch);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function failed(run: GroupRun): boolean {
  return run.conclusion === "failure" || run.conclusion === "cancelled";
}

/** GitHub's own annotation on every failed step: it says nothing the job name doesn't. */
const exitCodePattern = /^Process completed with exit code/i;

/** The first failure annotation's title that says what failed, for the author's wake, or null. */
export function errorLine(run: GroupRun): string | null {
  const titles = run.failedJobs.flatMap((job) => job.annotationTitles ?? []);
  return titles.find((title) => title.trim() !== "" && !exitCodePattern.test(title)) ?? null;
}

/** Sets the hold for a group's pull request that GitHub took out, or lets a cancelled group off once. */
function holdCulprit(
  context: PassContext,
  run: GroupRun,
  row: GateRow,
  rows: readonly GateRow[],
  where: string,
): void {
  const { state } = context;
  const { number, head } = row.pull;
  const key = String(number);
  if (state.flakeLifted[key] === head) {
    logLine(context, "culprit", `failed group ${where} culprit #${number}(flake, hold lifted)`);
    return;
  }
  if (
    run.conclusion === "cancelled" &&
    run.failedJobs.length === 0 &&
    state.autoFlaked[key] === undefined
  ) {
    state.autoFlaked[key] = head;
    state.flakeLifted[key] = head;
    logLine(
      context,
      "culprit",
      `cancelled group ${run.url} #${number}(cancelled run, re-queued once)`,
    );
    return;
  }
  if (refusedOnly(run)) {
    logLine(
      context,
      "culprit",
      `failed group ${where} culprit #${number}(runner hook refused a rebuilt group's jobs; not a failure)`,
    );
    return;
  }
  const culprit = groupCulprit(context, run, row, rows, where);
  if (culprit === undefined) {
    return;
  }
  const ahead = culprit.pull;
  if (
    culprit !== row &&
    (culprit.entry !== undefined || state.flakeLifted[ahead.number] === ahead.head)
  ) {
    logLine(
      context,
      "culprit",
      `failed group ${where} culprit #${ahead.number}(still queued or lifted; its own group decides)`,
    );
    return;
  }
  hold(context, run, culprit, where);
}

/** Holds `row`'s pull request until it has a new head, and tells its author once. */
function hold(context: PassContext, run: GroupRun, row: GateRow, where: string): void {
  const { state } = context;
  const { number, head } = row.pull;
  const key = String(number);
  const jobs = run.failedJobs.map((job) => job.name);
  // Its own group may have held it first: that run is the one to show.
  if (state.failedHeads[key] !== head || state.heldRuns[key]?.head !== head) {
    state.heldRuns[key] = { head, url: run.url, jobs, error: errorLine(run) };
  }
  state.failedHeads[key] = head;
  logLine(
    context,
    "culprit",
    `failed group ${where} culprit #${number} (out of queue, held until a new head)`,
  );
  commentOnce(context, "held", number, head, texts.culprit(jobs, run.url));
  wakeAuthor(context, row.pull, "group-failed", failedGroupFacts(row.pull, jobs, run.url));
}

/** Judges one failed group; returns whether it is seen for good. */
function judgeGroup(context: PassContext, run: GroupRun, rows: readonly GateRow[]): boolean {
  const number = groupPull(run.branch);
  const row = rows.find((each) => each.pull.number === number);
  const fresh = minutesSince(context, run.createdAt) < culpritWindowMinutes;
  const jobs = run.failedJobs.map((job) => job.name);
  const where = `${run.url}${jobs.length > 0 ? ` [${jobs.join(", ")}]` : ""}`;
  // A cancelled group without a failed job is usually a rebuild behind a jump or a removal: quiet.
  const loud = run.conclusion === "failure" || jobs.length > 0;
  if (row === undefined) {
    if (loud) {
      logLine(context, "culprit", `failed group ${where}`);
    }
    return true;
  }
  if (row.entry !== undefined && fresh) {
    // GitHub hasn't taken it out yet: look again next pass, or it would be re-added on the same head (#4445).
    if (loud) {
      logLine(
        context,
        "culprit",
        `failed group ${where} culprit #${row.pull.number}(still queued)`,
      );
    }
    return false;
  }
  if (row.entry === undefined && fresh) {
    holdCulprit(context, run, row, rows, where);
  }
  return true;
}

/**
 * A head GitHub took out for failed checks after its last push, longer ago
 * than the culprit window, with no pass having judged any of its groups up to
 * then: the pass wasn't running, or lost its state (#5768, HAL-18324). It is
 * held as the Merger holds it, since the group can no longer be judged.
 */
export function unjudgedHolds(context: PassContext, rows: readonly GateRow[]): void {
  const { state } = context;
  const seen = new Set(state.seenFailedRuns);
  for (const row of rows) {
    const { number, head, queueExit } = row.pull;
    const key = String(number);
    const judged = context.snapshot.groupRuns.some(
      (run) =>
        groupPull(run.branch) === number &&
        seen.has(run.id) &&
        run.createdAt <= (queueExit?.at ?? ""),
    );
    if (
      row.entry !== undefined ||
      queueExit?.reason !== "FAILED_CHECKS" ||
      queueExit.at < lastPushOf(row.pull) ||
      minutesSince(context, queueExit.at) < culpritWindowMinutes ||
      judged ||
      state.failedHeads[key] === head ||
      state.flakeLifted[key] === head
    ) {
      continue;
    }
    state.failedHeads[key] = head;
    logLine(
      context,
      "culprit",
      `UNJUDGED_HOLD #${number} (GitHub took it out for failed checks at ${queueExit.at.slice(11, 16)} on this head; no pass judged its group)`,
    );
  }
}

/** Reads the failed groups not seen before, and sets or lifts culprit holds. */
export function failedGroups(context: PassContext, rows: readonly GateRow[]): void {
  const seen = new Set(context.state.seenFailedRuns);
  const recent = context.snapshot.groupRuns.filter(
    (run) =>
      failed(run) &&
      !seen.has(run.id) &&
      minutesSince(context, run.createdAt) < failedGroupHours * 60,
  );
  for (const run of recent) {
    if (judgeGroup(context, run, rows)) {
      seen.add(run.id);
    }
  }
  context.state.seenFailedRuns = [...seen].slice(-keptSeenRuns);
}
