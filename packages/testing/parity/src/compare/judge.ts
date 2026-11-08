import type { AllowedDifference } from "../allowed-differences.ts";
import type { AllowedFixture } from "./allowed-fixtures.ts";
import { type Comparison, deepEqual } from "./compare.ts";

/**
 * `same`: old and new are equal. `allowed`: they differ exactly as an entry
 * of the allowed-differences file says. `different`: anything else.
 */
export type Verdict = "same" | "allowed" | "different";

export interface Judged extends Comparison {
  readonly verdict: Verdict;
  /** The entry that allows the difference, for `allowed`. */
  readonly entry?: string;
}

/** An entry's fixture that no longer describes a real difference. */
export interface StaleFixture {
  readonly entry: string;
  readonly case: string;
  readonly file: string;
  readonly reason: string;
}

export interface ParityReport {
  readonly results: readonly Judged[];
  /** Differences no entry allows. The compare passes only when this is empty. */
  readonly unexplained: readonly Judged[];
  /** Entries' fixtures that don't match a difference. The compare passes only when this is empty too. */
  readonly stale: readonly StaleFixture[];
}

const key = (caseId: string, file: string): string => `${caseId}: ${file}`;

function staleReason(fixture: AllowedFixture, found: Comparison | undefined): string | undefined {
  if (found === undefined) {
    return "no such fixture file";
  }
  if (found.same) {
    return "old and new are the same now: remove it";
  }
  if (!deepEqual(fixture.old, found.old) || !deepEqual(fixture.new, found.new)) {
    return "the results differ from the ones the entry writes out";
  }
  return undefined;
}

/**
 * Judges every comparison against the allowed differences. A difference is
 * allowed only by an entry that names the fixture file and writes out exactly
 * its old and its new result.
 */
export function judge(
  comparisons: readonly Comparison[],
  entries: readonly AllowedDifference[],
): ParityReport {
  const byFile = new Map(comparisons.map((c) => [key(c.caseId, c.file), c]));
  const allowedBy = new Map<string, string>();
  const stale: StaleFixture[] = [];
  for (const entry of entries) {
    for (const fixture of entry.fixtures ?? []) {
      const reason = staleReason(fixture, byFile.get(key(fixture.case, fixture.file)));
      if (reason !== undefined) {
        stale.push({ entry: entry.id, case: fixture.case, file: fixture.file, reason });
      } else {
        allowedBy.set(key(fixture.case, fixture.file), entry.id);
      }
    }
  }
  const results = comparisons.map((comparison): Judged => {
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
