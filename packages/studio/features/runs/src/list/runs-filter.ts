// Which runs the Runs list shows, and what it says when it shows none
// (checklist part 1, 1.2 to 1.4; states R1 to R6). Pure, so the page only
// draws what these return.

import type { RunStanding } from "@halonicjs/app";
import { emptyListWords } from "../run-words.ts";
import { dayWords } from "../time-words.ts";
import type { RunRow } from "./run-row.ts";

/** The status chips, one choice: All · Live · Needs you · Failed. */
export type StatusFilter = "all" | "live" | "needs-you" | "failed";

/** The filters the list is under. */
export interface RunsFilters {
  readonly status: StatusFilter;
  /** The Test runs chip: off hides finished test runs only. */
  readonly testRuns: boolean;
}

/** The filters a fresh list starts with: all runs, test runs off. */
export const startFilters: RunsFilters = { status: "all", testRuns: false };

const live: ReadonlySet<RunStanding> = new Set(["running", "needs-you", "waiting"]);
/** Failed takes every Stopped run too, as `halonic runs --status failed` does (mc 15.1). */
const failed: ReadonlySet<RunStanding> = new Set(["failed", "budget", "cancelled"]);

/** Whether a run is still going: running, or waiting for you or for something else. */
export function isLive(row: RunRow): boolean {
  return live.has(row.standing);
}

function matchesStatus(row: RunRow, status: StatusFilter): boolean {
  switch (status) {
    case "all":
      return true;
    case "live":
      return isLive(row);
    case "needs-you":
      return row.standing === "needs-you";
    case "failed":
      return failed.has(row.standing);
  }
}

/** Test runs off hides a test run once it has finished; a live one always shows. */
function matchesTestRuns(row: RunRow, testRuns: boolean): boolean {
  return testRuns || !row.test || isLive(row);
}

/** The rows the filters let through, in the order given. */
export function filterRuns(rows: readonly RunRow[], filters: RunsFilters): RunRow[] {
  return rows.filter(
    (row) => matchesStatus(row, filters.status) && matchesTestRuns(row, filters.testRuns),
  );
}

/**
 * The counts on the Live and Needs you chips, over the runs the Test runs chip
 * lets through, so a count never names a run the chip would hide.
 */
export function statusCounts(
  rows: readonly RunRow[],
  testRuns: boolean,
): { live: number; needsYou: number } {
  const shown = rows.filter((row) => matchesTestRuns(row, testRuns));
  return {
    live: shown.filter(isLive).length,
    needsYou: shown.filter((row) => row.standing === "needs-you").length,
  };
}

/** What the list says in place of rows, and the one thing to do next, if any. */
export type EmptyList =
  /** No runs at all (R1): the Empty state with Go to Workflows, and no filters above it. */
  | { readonly kind: "no-runs" }
  /** A status chip with none (R4 to R6): the line alone, since All is next to it (D13). */
  | { readonly kind: "status"; readonly line: string }
  /** Only finished test runs, with Test runs off (R2): the line with Show test runs. */
  | { readonly kind: "only-test-runs"; readonly line: string };

/**
 * Why the filtered list is empty, or `undefined` when it has rows. "No runs
 * match these filters" (R3) comes with the text and hub filters.
 */
export function emptyList(rows: readonly RunRow[], filters: RunsFilters): EmptyList | undefined {
  if (filterRuns(rows, filters).length > 0) {
    return undefined;
  }
  if (rows.length === 0) {
    return { kind: "no-runs" };
  }
  if (filters.status !== "all") {
    return { kind: "status", line: emptyListWords.status[filters.status] };
  }
  // With All on, only finished test runs can be hidden.
  return { kind: "only-test-runs", line: emptyListWords.onlyTestRuns };
}

/** The runs of one day, under its heading. */
export interface DayGroup {
  /** "Today", "Yesterday", then the date: "Fri 6 Nov". */
  readonly day: string;
  readonly rows: readonly RunRow[];
}

/**
 * The rows grouped by the day they started, in the order given (newest
 * first), in the computer's own time zone.
 *
 * @example
 * dayGroups(rows, new Date(2026, 10, 9)); // [{ day: "Today", rows: […] }, { day: "Yesterday", … }]
 */
export function dayGroups(rows: readonly RunRow[], now: Date): DayGroup[] {
  const groups: { day: string; rows: RunRow[] }[] = [];
  for (const row of rows) {
    const day = dayWords(new Date(row.startedAt), now);
    const last = groups.at(-1);
    if (last?.day === day) {
      last.rows.push(row);
    } else {
      groups.push({ day, rows: [row] });
    }
  }
  return groups;
}
