import type { StepResult } from "./runner.ts";

const verdictMark: Record<StepResult["verdict"], string> = {
  passed: "✅ passed",
  failed: "❌ failed",
  skipped: "⏭ skipped",
  "not run": "⏭ not run",
};

/** The pass/fail table for the job summary, with one line naming every failing step. */
export function resultsMarkdown(results: readonly StepResult[], build: string): string {
  const failed = results.filter((result) => result.verdict === "failed");
  const headline =
    failed.length === 0
      ? `All ${results.length} steps passed.`
      : `${failed.length} of ${results.length} steps failed: ${failed
          .map((result) => `step ${result.number} (${result.title}): ${result.code ?? "no code"}`)
          .join("; ")}.`;
  const rows = results.map((result) =>
    [
      String(result.number),
      cell(result.title),
      cell(result.requirements.join(", ")),
      verdictMark[result.verdict],
      cell(result.code ?? ""),
      cell(result.note ?? ""),
      result.screenshot ?? "",
    ].join(" | "),
  );
  return [
    `### Click test on the installed Studio (${cell(build)})`,
    "",
    headline,
    "",
    "| # | Step | Requirements | Verdict | Code | Note | Screenshot |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

/** Whether every step passed, which decides the job's exit code. */
export function allPassed(results: readonly StepResult[]): boolean {
  return results.length > 0 && results.every((result) => result.verdict === "passed");
}

// A pipe or a line break would split the table's row; notes can hold log lines.
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll(/\r?\n/g, "<br>");
}
