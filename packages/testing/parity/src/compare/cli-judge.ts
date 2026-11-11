import type { AllowedDifference } from "../allowed-differences.ts";
import type { KnownGap } from "../known-gaps.ts";
import { type CliComparison, type ComparedCall, sameCall } from "./cli-output.ts";
import { cliRules } from "./cli-rules.ts";
import { judgeByRules, type RuledVerdict, type StaleRunEntry } from "./rule-judge.ts";

export interface CliCallResult extends CliComparison {
  readonly verdict: RuledVerdict;
  /** Both sides after the rules, as they were compared. */
  readonly ruled: { readonly old: ComparedCall; readonly new: ComparedCall };
  /** The known gaps that name the call, for `gap`. */
  readonly gaps?: readonly string[];
}

export interface CliCallReport {
  readonly results: readonly CliCallResult[];
  /** Calls that differ with no rule or gap to explain it. The compare passes only when this is empty. */
  readonly unexplained: readonly CliCallResult[];
  /** Rules and gaps that change or excuse nothing. The compare passes only when this is empty too. */
  readonly stale: readonly StaleRunEntry[];
}

/**
 * Judges every CLI call of a fixture, as the run-log compare judges
 * the tests: the rules the allowed differences name in `cliRules` are applied to
 * both sides, in the order of {@link cliRules}; a call equal after them is
 * allowed, one that still differs is a gap when a known gap names it in
 * `calls`, and different otherwise. A rule that changes no call is stale, and
 * so is a gap whose call no longer differs or doesn't exist.
 */
export function judgeCliCalls(
  comparisons: readonly CliComparison[],
  entries: readonly AllowedDifference[],
  gaps: readonly KnownGap[],
): CliCallReport {
  const named = new Map(
    entries.flatMap((entry) => (entry.cliRules ?? []).map((id) => [id, entry.id])),
  );
  const { judged: results, stale } = judgeByRules<ComparedCall, CliComparison>({
    pairs: comparisons,
    nameOf: (comparison) => comparison.call,
    rules: cliRules,
    named,
    gaps: gaps.map((gap) => ({ id: gap.id, names: gap.calls ?? [] })),
    same: sameCall,
    missing: "no such call",
    unused: {
      rule: "the rule changes no call: remove it",
      gap: "the call matches now: remove it",
    },
  });
  return {
    results,
    unexplained: results.filter((result) => result.verdict === "different"),
    stale,
  };
}
