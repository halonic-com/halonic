import type { AllowedDifference } from "../allowed-differences.ts";
import type { KnownGap } from "../known-gaps.ts";
import { judgeByRules, type RuledVerdict, type StaleRunEntry } from "./rule-judge.ts";
import type { ComparedTest, RunLogComparison } from "./run-logs.ts";
import { sameTest } from "./run-logs.ts";
import { runRules } from "./run-rules.ts";

/** A test's verdict; see {@link RuledVerdict}. */
export type RunLogVerdict = RuledVerdict;

export type { StaleRunEntry };

export interface RunLogResult extends RunLogComparison {
  readonly verdict: RunLogVerdict;
  /** Both sides after the rules, as they were compared. */
  readonly ruled: { readonly old: ComparedTest; readonly new: ComparedTest };
  /** The known gaps that name the test, for `gap`. */
  readonly gaps?: readonly string[];
}

export interface RunLogReport {
  readonly results: readonly RunLogResult[];
  /** Tests that differ with no rule or gap to explain it. The compare passes only when this is empty. */
  readonly unexplained: readonly RunLogResult[];
  /** Rules and gaps that change or excuse nothing. The compare passes only when this is empty too. */
  readonly stale: readonly StaleRunEntry[];
}

/**
 * Judges every test of a fixture. The rules the allowed differences name in
 * `runRules` are applied to both sides, in the order of {@link runRules};
 * a test equal after them is allowed. A test that still differs is a gap
 * when a known gap names it, and different otherwise.
 *
 * A rule that changes no test is stale, and so is a gap whose test no
 * longer differs or doesn't exist: either way the entry has to go.
 */
export function judgeRunLogs(
  comparisons: readonly RunLogComparison[],
  entries: readonly AllowedDifference[],
  gaps: readonly KnownGap[],
): RunLogReport {
  const named = new Map(
    entries.flatMap((entry) => (entry.runRules ?? []).map((id) => [id, entry.id])),
  );
  const { judged: results, stale } = judgeByRules<ComparedTest, RunLogComparison>({
    pairs: comparisons,
    nameOf: (comparison) => comparison.test,
    rules: runRules,
    named,
    gaps: gaps.map((gap) => ({ id: gap.id, names: gap.tests ?? [] })),
    same: sameTest,
    missing: "no such test",
    unused: {
      rule: "the rule changes no test: remove it",
      gap: "the test matches now: remove it",
    },
  });
  return {
    results,
    unexplained: results.filter((result) => result.verdict === "different"),
    stale,
  };
}
