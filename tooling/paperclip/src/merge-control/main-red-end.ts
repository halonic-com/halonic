import type { PassContext } from "./context.ts";

/**
 * When the main-red freeze ends (board CI sweep, HAL-17912 items D and F,
 * as the Merger does it since 25 Nov): on the newest completed, not
 * cancelled `CI` push run on `main` created after the freeze began, if it
 * passed or failed only in known-flaky jobs, or on a merge group created
 * after the freeze began that passed. Any other red job keeps the freeze.
 */

/** Jobs that fail when another job fails, so they never count as red themselves. */
const followerPrefixes = ["ci-ok", "Cancel the run"];

/** Why the freeze ends, for the pass log, or undefined while it holds. */
export function mainRedEnd(context: PassContext, since: string): string | undefined {
  const { snapshot, settings } = context;
  const newest = snapshot.mainRuns
    .filter(
      (run) =>
        run.status === "completed" && run.createdAt > since && run.conclusion !== "cancelled",
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (newest?.conclusion === "success") {
    return `MAIN_GREEN at ${newest.headSha.slice(0, 9)}`;
  }
  // Jobs not read count as red: the freeze holds rather than end on a guess.
  const red = (newest?.redJobs ?? []).filter(
    (name) => !followerPrefixes.some((prefix) => name.startsWith(prefix)),
  );
  if (red.length > 0 && red.every((name) => settings.knownFlakyPushJobs.includes(name))) {
    return `MAIN_RED_END at ${newest?.headSha.slice(0, 9)} (only known-flaky jobs failed: ${red.join(", ")})`;
  }
  const group = snapshot.groupRuns
    .filter((run) => run.conclusion === "success" && run.createdAt > since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (group !== undefined) {
    return `MAIN_RED_END (green merge group ${group.url})`;
  }
  return undefined;
}
