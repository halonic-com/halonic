// Which runs Home's Recent runs shows (checklist part 1, 1.1; UX2 1.9): the
// latest five, with the runs that need you or are running above the finished
// ones even when older. Pure, so the card only draws what this returns.

import type { RunRow } from "./run-row.ts";

/** How many runs Home's Recent runs shows. */
export const RECENT_RUNS = 5;

/**
 * The rows Recent runs shows, from the list's rows newest first: running and needs-you runs
 * first, then the rest, each group newest first, cut at {@link RECENT_RUNS}. A finished test
 * run is left out, as the Runs list leaves it out until you ask; a live one stays.
 */
export function recentRuns(rows: readonly RunRow[]): RunRow[] {
  const shown = rows.filter((row) => !row.test || isWorking(row));
  return [...shown.filter(isWorking), ...shown.filter((row) => !isWorking(row))].slice(
    0,
    RECENT_RUNS,
  );
}

function isWorking(row: RunRow): boolean {
  return row.standing === "running" || row.standing === "needs-you";
}
