import type { StepResult } from "./runner.ts";

const verdictMark: Record<StepResult["verdict"], string> = {
  passed: "✅ passed",
  failed: "❌ failed",
  skipped: "⏭ skipped",
  "not run": "⏭ not run",
};

/**
 * Which steps a build left out: those its change since `since` didn't touch
 * (HAL-18716 point 3). A build that runs every step passes none.
 */
export interface LeftOut {
  readonly since: string;
  readonly steps: readonly Pick<StepResult, "id" | "title">[];
}

/**
 * The pass/fail table for the job summary, with one line naming every failing
 * step and, when the build ran only the steps its change touched, one naming
 * those it left out.
 */
export function resultsMarkdown(
  results: readonly StepResult[],
  build: string,
  leftOut?: LeftOut,
): string {
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
    ...(leftOut === undefined ? [] : [choiceLine(leftOut), ""]),
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

function choiceLine({ since, steps }: LeftOut): string {
  const ran = `Ran the short check and the steps this change touched since \`${cell(since)}\``;
  if (steps.length === 0) return `${ran}: every step.`;
  const names = steps.map((step) => `${cell(step.title)} (\`${step.id}\`)`).join(", ");
  return `${ran}. Not touched, so not run: ${names}.`;
}

// A pipe or a line break would split the table's row; notes can hold log lines.
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll(/\r?\n/g, "<br>");
}
