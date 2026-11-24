import { commentOnce, logLine, minutesSince, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";
import type { GroupRun } from "./snapshot.ts";
import { texts } from "./texts.ts";

/**
 * Failed merge groups (MERGER.md §6). A group that ends `cancelled` can hide
 * a failed job, so those count too. The group's own pull request, once
 * GitHub has taken it out, is the likely culprit: it is held until it has a
 * new head (rule 13), and told once which job failed. A cancelled group with
 * no failed job lets its pull request back in once (Chief, HAL-10, 24 Nov);
 * a second one holds it.
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

/** Sets the hold for a group's pull request that GitHub took out, or lets a cancelled group off once. */
function holdCulprit(context: PassContext, run: GroupRun, row: GateRow, where: string): void {
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
  state.failedHeads[key] = head;
  logLine(
    context,
    "culprit",
    `failed group ${where} culprit #${number} (out of queue, held until a new head)`,
  );
  const jobs = run.failedJobs.map((job) => job.name);
  commentOnce(context, "held", number, head, texts.culprit(jobs, run.url));
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
    holdCulprit(context, run, row, where);
  }
  return true;
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
