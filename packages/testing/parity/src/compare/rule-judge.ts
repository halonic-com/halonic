/**
 * The judging the run-log and the CLI compare share: each applies its
 * rules to both sides of every pair, then says per pair whether it is the
 * same, allowed, a known gap or different, and which rules and gaps are
 * stale.
 */

/**
 * `same`: old and new are equal as they are. `allowed`: equal once the rules
 * of the allowed differences are applied. `gap`: still different, and a
 * known gap names it. `different`: anything else.
 */
export type RuledVerdict = "same" | "allowed" | "gap" | "different";

/** One rule: what it takes out or reorders, on the side it names. */
export interface SideRule<T> {
  readonly id: string;
  readonly old?: (value: T) => T;
  readonly new?: (value: T) => T;
}

/** A rule or a known gap that no longer describes a real difference. */
export interface StaleRunEntry {
  readonly entry: string;
  readonly reason: string;
}

/** One pair as it was judged. */
export interface Ruled<T> {
  readonly verdict: RuledVerdict;
  /** Both sides after the rules, as they were compared. */
  readonly ruled: { readonly old: T; readonly new: T };
  /** The known gaps that name the pair, for `gap`. */
  readonly gaps?: readonly string[];
}

/** What {@link judgeByRules} judges. */
export interface RuleJudgeInput<T, P extends { readonly old: T; readonly new: T }> {
  readonly pairs: readonly P[];
  /** A pair's name, the way a known gap names it. */
  readonly nameOf: (pair: P) => string;
  /** Every rule the compare has, in the order it applies them. */
  readonly rules: readonly SideRule<T>[];
  /** The rule ids the allowed differences name, each to the id of the entry that names it. */
  readonly named: ReadonlyMap<string, string>;
  /** The known gaps, each with the names of the pairs it excuses. */
  readonly gaps: readonly { readonly id: string; readonly names: readonly string[] }[];
  readonly same: (a: T, b: T) => boolean;
  /** What a stale gap's pair is called when no pair has its name, such as "no such test". */
  readonly missing: string;
  /** What a stale rule or gap is told to do, such as "the rule changes no test: remove it". */
  readonly unused: { readonly rule: string; readonly gap: string };
}

/**
 * Applies the named rules, in the order of `rules`, to both sides of every
 * pair. A pair equal after them is allowed; one that still differs is a gap
 * when a known gap names it, and different otherwise. A rule that changes no
 * pair is stale, and so is a gap whose pair no longer differs or doesn't
 * exist.
 */
export function judgeByRules<T, P extends { readonly old: T; readonly new: T }>(
  input: RuleJudgeInput<T, P>,
): {
  readonly judged: readonly (P & Ruled<T>)[];
  readonly stale: readonly StaleRunEntry[];
} {
  const rules = input.rules.filter((rule) => input.named.has(rule.id));
  const used = new Set<string>();
  const judged = input.pairs.map((pair): P & Ruled<T> => {
    const ruled = rules.reduce(
      (sides, rule) => {
        const old = rule.old?.(sides.old) ?? sides.old;
        const fresh = rule.new?.(sides.new) ?? sides.new;
        if (!input.same(old, sides.old) || !input.same(fresh, sides.new)) used.add(rule.id);
        return { old, new: fresh };
      },
      { old: pair.old, new: pair.new },
    );
    if (input.same(pair.old, pair.new)) return { ...pair, verdict: "same", ruled };
    if (input.same(ruled.old, ruled.new)) return { ...pair, verdict: "allowed", ruled };
    const name = input.nameOf(pair);
    const naming = input.gaps.filter((gap) => gap.names.includes(name)).map((gap) => gap.id);
    return naming.length > 0
      ? { ...pair, verdict: "gap", ruled, gaps: naming }
      : { ...pair, verdict: "different", ruled };
  });
  const stale: StaleRunEntry[] = rules
    .filter((rule) => !used.has(rule.id))
    .map((rule) => ({
      entry: `${input.named.get(rule.id)}: ${rule.id}`,
      reason: input.unused.rule,
    }));
  const verdicts = new Map(judged.map((pair) => [input.nameOf(pair), pair.verdict]));
  for (const gap of input.gaps) {
    for (const name of gap.names) {
      const verdict = verdicts.get(name);
      if (verdict === undefined) {
        stale.push({ entry: `${gap.id}: ${name}`, reason: input.missing });
      } else if (verdict !== "gap") {
        stale.push({ entry: `${gap.id}: ${name}`, reason: input.unused.gap });
      }
    }
  }
  return { judged, stale };
}
