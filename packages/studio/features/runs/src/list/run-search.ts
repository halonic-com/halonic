// What Ctrl K finds among the runs (checklist part 1, 1.1; revision 10: a run is named by
// its short id everywhere). Pure, so the provider only fetches the rows and maps the hits.

import type { RunRow } from "./run-row.ts";

/** How many of the newest runs Ctrl K looks through. */
export const SEARCHED_RUNS = 500;

/** How many runs one search shows, so a short word doesn't fill the palette. */
export const SHOWN_RUNS = 8;

/**
 * The words with the "run" and "#" a person may put in front of a short id taken away, lower
 * case: "Run 01JD8Q" and "#01jd8q" both look for 01jd8q.
 */
export function searchedWords(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/^(run\b\s*)?#?\s*/, "");
}

/**
 * The runs whose short id or workflow name holds the words, newest first, from the newest
 * {@link SEARCHED_RUNS} of the rows given newest first. A short id that starts with the words
 * comes before one that only holds them.
 */
export function findRuns(rows: readonly RunRow[], query: string): RunRow[] {
  const words = searchedWords(query);
  if (words === "") return [];
  const hits = rows
    .slice(0, SEARCHED_RUNS)
    .filter(
      (row) =>
        row.shortId.toLowerCase().includes(words) || row.workflow.toLowerCase().includes(words),
    );
  const startsWith = (row: RunRow) => row.shortId.toLowerCase().startsWith(words);
  return [...hits.filter(startsWith), ...hits.filter((row) => !startsWith(row))].slice(
    0,
    SHOWN_RUNS,
  );
}
