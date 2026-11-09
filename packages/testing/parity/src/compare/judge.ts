import type { AllowedDifference } from "../allowed-differences.ts";
import { type Comparison, deepEqual } from "./compare.ts";
import type { CheckComparison } from "./loader-checks.ts";

/**
 * `same`: old and new are equal. `allowed`: they differ exactly as an entry
 * of the allowed-differences file says. `different`: anything else.
 */
export type Verdict = "same" | "allowed" | "different";

/** What judging needs of a comparison: which file, both results, and whether they are equal. */
export interface Compared {
  readonly caseId: string;
  readonly file: string;
  readonly old: unknown;
  readonly new: unknown;
  readonly same: boolean;
}

export type Judged<C extends Compared = Comparison> = C & {
  readonly verdict: Verdict;
  /** The entry that allows the difference, for `allowed`. */
  readonly entry?: string;
};

/** An entry's fixture that no longer describes a real difference. */
export interface StaleFixture {
  readonly entry: string;
  readonly case: string;
  readonly file: string;
  readonly reason: string;
}

export interface ParityReport<C extends Compared = Comparison> {
  readonly results: readonly Judged<C>[];
  /** Differences no entry allows. The compare passes only when this is empty. */
  readonly unexplained: readonly Judged<C>[];
  /** Entries' fixtures that don't match a difference. The compare passes only when this is empty too. */
  readonly stale: readonly StaleFixture[];
}

/** One fixture file an entry lets differ, with both results written out. */
interface Allowance {
  readonly entry: string;
  readonly case: string;
  readonly file: string;
  readonly old: unknown;
  readonly new: unknown;
}

const key = (caseId: string, file: string): string => `${caseId}: ${file}`;

function staleReason(allowance: Allowance, found: Compared | undefined): string | undefined {
  if (found === undefined) {
    return "no such fixture file";
  }
  if (found.same) {
    return "old and new are the same now: remove it";
  }
  if (!deepEqual(allowance.old, found.old) || !deepEqual(allowance.new, found.new)) {
    return "the results differ from the ones the entry writes out";
  }
  return undefined;
}

/**
 * Judges every comparison against the allowances. A difference is allowed
 * only by an allowance that names the fixture file and writes out exactly
 * its old and its new result.
 */
function judgeAgainst<C extends Compared>(
  comparisons: readonly C[],
  allowances: readonly Allowance[],
): ParityReport<C> {
  const byFile = new Map(comparisons.map((c) => [key(c.caseId, c.file), c]));
  const allowedBy = new Map<string, string>();
  const stale: StaleFixture[] = [];
  for (const allowance of allowances) {
    const reason = staleReason(allowance, byFile.get(key(allowance.case, allowance.file)));
    if (reason !== undefined) {
      stale.push({ entry: allowance.entry, case: allowance.case, file: allowance.file, reason });
    } else {
      allowedBy.set(key(allowance.case, allowance.file), allowance.entry);
    }
  }
  const results = comparisons.map((comparison): Judged<C> => {
    if (comparison.same) {
      return { ...comparison, verdict: "same" };
    }
    const entry = allowedBy.get(key(comparison.caseId, comparison.file));
    return entry === undefined
      ? { ...comparison, verdict: "different" }
      : { ...comparison, verdict: "allowed", entry };
  });
  return {
    results,
    unexplained: results.filter((result) => result.verdict === "different"),
    stale,
  };
}

/** Judges each file's own result against the entries' `fixtures`. */
export function judge(
  comparisons: readonly Comparison[],
  entries: readonly AllowedDifference[],
): ParityReport {
  const allowances = entries.flatMap((entry) =>
    (entry.fixtures ?? []).map((fixture) => ({ entry: entry.id, ...fixture })),
  );
  return judgeAgainst(comparisons, allowances);
}

/** Judges each file's messages from checks between files against the entries' `checks`. */
export function judgeChecks(
  comparisons: readonly CheckComparison[],
  entries: readonly AllowedDifference[],
): ParityReport<CheckComparison> {
  const allowances = entries.flatMap((entry) =>
    (entry.checks ?? []).map((check) => ({ entry: entry.id, ...check })),
  );
  return judgeAgainst(comparisons, allowances);
}
