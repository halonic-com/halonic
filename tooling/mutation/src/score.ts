/**
 * The part of Stryker's JSON report we read (the mutation-testing-elements
 * report schema): every file with its mutants and their status.
 */
export interface MutationReport {
  readonly files: Readonly<
    Record<string, { readonly mutants: readonly { readonly status: string }[] }>
  >;
}

/** How many mutants ended in each outcome, and the score they give. */
export interface MutationScore {
  /** Mutants a test failed on, or that made the tests time out. */
  readonly detected: number;
  /** Mutants every test passed with, including those no test reached. */
  readonly survived: number;
  /** Of the survivors, the mutants no test reached at all. */
  readonly noCoverage: number;
  /** Mutants that didn't compile or crashed; they don't count either way. */
  readonly errors: number;
  /** Detected as a share of detected plus survived, in percent; null when there was nothing to score. */
  readonly score: number | null;
}

const detectedStatuses = new Set(["Killed", "Timeout"]);
const survivedStatuses = new Set(["Survived", "NoCoverage"]);
const errorStatuses = new Set(["CompileError", "RuntimeError"]);

/**
 * Counts a Stryker report the way Stryker scores it: killed and timed-out
 * mutants are detected, survived and uncovered ones are not, and errors
 * and ignored mutants are left out.
 */
export function scoreOf(report: MutationReport): MutationScore {
  const counts = { detected: 0, survived: 0, noCoverage: 0, errors: 0 };
  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) {
      countMutant(counts, mutant.status);
    }
  }
  const valid = counts.detected + counts.survived;
  const score = valid === 0 ? null : Math.round((counts.detected / valid) * 1000) / 10;
  return { ...counts, score };
}

type Counts = { detected: number; survived: number; noCoverage: number; errors: number };

/** Adds one mutant's outcome to the tallies; other statuses are left out. */
function countMutant(counts: Counts, status: string): void {
  if (detectedStatuses.has(status)) {
    counts.detected += 1;
  } else if (survivedStatuses.has(status)) {
    counts.survived += 1;
    if (status === "NoCoverage") {
      counts.noCoverage += 1;
    }
  } else if (errorStatuses.has(status)) {
    counts.errors += 1;
  }
}

/** The outcome for one package in a nightly run. */
export type PackageResult =
  | { readonly name: string; readonly kind: "scored"; readonly score: MutationScore }
  | { readonly name: string; readonly kind: "no-code" }
  | { readonly name: string; readonly kind: "failed"; readonly reason: string };

function row(result: PackageResult): string {
  switch (result.kind) {
    case "scored": {
      const { score, detected, survived, noCoverage, errors } = result.score;
      const percent = score === null ? "no mutants" : `${score.toFixed(1)}%`;
      return `| ${result.name} | ${percent} | ${detected} | ${survived} | ${noCoverage} | ${errors} |`;
    }
    case "no-code":
      return `| ${result.name} | no code yet | | | | |`;
    case "failed":
      return `| ${result.name} | failed: ${result.reason} | | | | |`;
  }
}

/** The Markdown table for the job summary: one row per package. */
export function summaryTable(results: readonly PackageResult[]): string {
  return [
    "## Mutation score per package",
    "",
    "Report only: no floor yet. Survived includes the mutants no test reached.",
    "",
    "| Package | Score | Detected | Survived | No coverage | Errors |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results.map(row),
    "",
  ].join("\n");
}
