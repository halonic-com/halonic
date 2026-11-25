import { logLine, type PassContext } from "./context.ts";
import type { GateRow } from "./gate.ts";
import type { GroupRun } from "./snapshot.ts";
import { texts } from "./texts.ts";

/**
 * Main is broken, not the group's pull request (Chief, HAL-17875, 24 Nov
 * 22:20, as the Merger's `pass.js` does it): when every failed job's
 * annotations name files, and none of them is a file the pull request
 * touches, it isn't held. The main-red freeze starts instead (only reverts,
 * and the fix the board adds to its pattern, go in) and is said once. A job
 * whose annotations name no file (typecheck, tests) keeps the culprit hold.
 */

/** The freeze's pattern until the board adds the fix pull request. */
export const mainBrokenAllowRe = "^revert\\b";

/** The files every failed job names, or undefined when a job names none or wasn't read. */
export function brokenFiles(run: GroupRun): string[] | undefined {
  if (run.failedJobs.length === 0) {
    return undefined;
  }
  const files = new Set<string>();
  for (const job of run.failedJobs) {
    if (job.annotatedFiles === undefined || job.annotatedFiles.length === 0) {
      return undefined;
    }
    for (const file of job.annotatedFiles) {
      files.add(file);
    }
  }
  return [...files];
}

/** Whether main is broken rather than `row`'s pull request; records it and starts the freeze once. */
export function mainBroken(
  context: PassContext,
  run: GroupRun,
  row: GateRow,
  where: string,
): boolean {
  const { pull } = row;
  const files = brokenFiles(run);
  // Every changed file must be known: past the first 100 the pull request may touch one of them.
  if (
    files === undefined ||
    pull.filesTotal > pull.files.length ||
    files.some((file) => pull.files.includes(file))
  ) {
    return false;
  }
  const named = files.slice(0, 3).join(", ");
  logLine(
    context,
    "culprit",
    `failed group ${where} culprit #${pull.number}(not this PR: main broken in ${named})`,
  );
  const { state } = context;
  const at = context.now.toISOString();
  if (state.mainBroken === null) {
    state.mainBroken = { since: at, run: run.url, files };
    logLine(context, "main-broken", texts.mainBroken(named, run.url));
  }
  state.board.mainRed ??= { since: at, allowRe: mainBrokenAllowRe };
  return true;
}
