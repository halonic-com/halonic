import type { AllowedDifference } from "../allowed-differences.ts";
import type { KnownGap } from "../known-gaps.ts";
import type { ComparedTest, RunLogComparison } from "./run-logs.ts";
import { sameTest } from "./run-logs.ts";
import { type RunRule, runRules } from "./run-rules.ts";

/**
 * `same`: old and new are equal as they are. `allowed`: equal once the rules
 * of the allowed differences are applied. `gap`: still different, and a
 * known gap names the test. `different`: anything else.
 */
export type RunLogVerdict = "same" | "allowed" | "gap" | "different";

export interface RunLogResult extends RunLogComparison {
  readonly verdict: RunLogVerdict;
  /** Both sides after the rules, as they were compared. */
  readonly ruled: { readonly old: ComparedTest; readonly new: ComparedTest };
  /** The known gaps that name the test, for `gap`. */
  readonly gaps?: readonly string[];
}

/** A rule or a known gap that no longer describes a real difference. */
export interface StaleRunEntry {
  readonly entry: string;
  readonly reason: string;
}

export interface RunLogReport {
  readonly results: readonly RunLogResult[];
  /** Tests that differ with no rule or gap to explain it. The compare passes only when this is empty. */
  readonly unexplained: readonly RunLogResult[];
  /** Rules and gaps that change or excuse nothing. The compare passes only when this is empty too. */
  readonly stale: readonly StaleRunEntry[];
}

interface Ruled {
  readonly old: ComparedTest;
  readonly new: ComparedTest;
}

/** Applies one rule to a pair, and says whether it changed either side. */
function apply(rule: RunRule, pair: Ruled): { pair: Ruled; changed: boolean } {
  const old = rule.old?.(pair.old) ?? pair.old;
  const fresh = rule.new?.(pair.new) ?? pair.new;
  return {
    pair: { old, new: fresh },
    changed: !sameTest(old, pair.old) || !sameTest(fresh, pair.new),
  };
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
  const rules = runRules.filter((rule) => named.has(rule.id));
  const used = new Set<string>();
  const ruled = comparisons.map((comparison) =>
    rules.reduce<Ruled>((pair, rule) => {
      const step = apply(rule, pair);
      if (step.changed) used.add(rule.id);
      return step.pair;
    }, comparison),
  );
  const stale: StaleRunEntry[] = rules
    .filter((rule) => !used.has(rule.id))
    .map((rule) => ({
      entry: `${named.get(rule.id)}: ${rule.id}`,
      reason: "the rule changes no test: remove it",
    }));
  const results = comparisons.map((comparison, index): RunLogResult => {
    const pair = ruled[index] ?? comparison;
    const base = { ...comparison, ruled: pair };
    if (sameTest(comparison.old, comparison.new)) return { ...base, verdict: "same" };
    if (sameTest(pair.old, pair.new)) return { ...base, verdict: "allowed" };
    const naming = gaps.filter((gap) => gap.tests.includes(comparison.test)).map((gap) => gap.id);
    return naming.length > 0
      ? { ...base, verdict: "gap", gaps: naming }
      : { ...base, verdict: "different" };
  });
  const verdicts = new Map(results.map((result) => [result.test, result.verdict]));
  for (const gap of gaps) {
    for (const test of gap.tests) {
      const verdict = verdicts.get(test);
      if (verdict === undefined) {
        stale.push({ entry: `${gap.id}: ${test}`, reason: "no such test" });
      } else if (verdict !== "gap") {
        stale.push({ entry: `${gap.id}: ${test}`, reason: "the test matches now: remove it" });
      }
    }
  }
  return {
    results,
    unexplained: results.filter((result) => result.verdict === "different"),
    stale,
  };
}
