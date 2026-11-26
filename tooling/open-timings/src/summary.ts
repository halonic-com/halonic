import { type OpenTimings, openProblem } from "./parse-timings.ts";

/** The budget for an open: generous, to catch big regressions on shared runners (HAL-19531). */
export const OPEN_BUDGET_MS = 10_000;

/** The job summary for `timings`: a table of step and ms, then whether the open passed. */
export function formatSummary(timings: OpenTimings, budgetMs: number = OPEN_BUDGET_MS): string {
  const lines = ["## Studio's open timings", ""];
  if (timings.rows.length === 0) {
    lines.push("`shell.log` held no `timings` lines.");
  } else {
    lines.push("| Step | ms |", "| --- | ---: |");
    for (const row of timings.rows) lines.push(`| ${row.step} | ${row.ms} |`);
  }
  const problem = openProblem(timings, budgetMs);
  lines.push(
    "",
    problem === undefined ? `Within the ${budgetMs} ms budget.` : `**Flagged:** ${problem}.`,
    "",
  );
  return lines.join("\n");
}
