import { describe, expect, it } from "vitest";
import { createExpect, type Matchers, matcherNames } from "./expect.ts";

/**
 * One input for a matcher: the value under test, the matcher's argument and
 * whether the check is negated with `not`. Every row runs through the shim
 * and through Vitest, and both must agree on pass or fail.
 */
interface ParityRow {
  readonly matcher: keyof Matchers;
  readonly actual: unknown;
  readonly expected?: unknown;
  readonly negated?: boolean;
}

const sharedObject = { name: "acme" };

/** Add rows here with every new matcher: at least one that passes and one that fails. */
const rows: readonly ParityRow[] = [
  { matcher: "toBe", actual: 1, expected: 1 },
  { matcher: "toBe", actual: 1, expected: "1" },
  { matcher: "toBe", actual: Number.NaN, expected: Number.NaN },
  { matcher: "toBe", actual: 0, expected: -0 },
  { matcher: "toBe", actual: sharedObject, expected: sharedObject },
  { matcher: "toBe", actual: { name: "acme" }, expected: { name: "acme" } },
  { matcher: "toBe", actual: { name: "acme" }, expected: { name: "acme" }, negated: true },
  { matcher: "toBe", actual: null, expected: undefined },
  { matcher: "toBeGreaterThanOrEqual", actual: 2, expected: 1 },
  { matcher: "toBeGreaterThanOrEqual", actual: 1, expected: 1 },
  { matcher: "toBeGreaterThanOrEqual", actual: 0, expected: 1 },
  { matcher: "toBeGreaterThanOrEqual", actual: 3n, expected: 2n },
  { matcher: "toBeGreaterThanOrEqual", actual: Number.NaN, expected: 0 },
  { matcher: "toBeGreaterThanOrEqual", actual: 0, expected: 1, negated: true },
  { matcher: "toBeNull", actual: null },
  { matcher: "toBeNull", actual: undefined },
  { matcher: "toBeNull", actual: 0, negated: true },
  { matcher: "toBeUndefined", actual: undefined },
  { matcher: "toBeUndefined", actual: null },
  { matcher: "toBeUndefined", actual: "", negated: true },
];

type Outcome = "passes" | "fails";

function outcomeOf(check: () => void): Outcome {
  try {
    check();
    return "passes";
  } catch {
    return "fails";
  }
}

function runRow(assertion: Matchers & { not: Matchers }, row: ParityRow): void {
  const matchers = row.negated === true ? assertion.not : assertion;
  const matcher = matchers[row.matcher] as (expected?: unknown) => void;
  matcher.call(matchers, row.expected);
}

describe("the shim's matchers agree with Vitest's", () => {
  const shimExpect = createExpect();

  it.each(
    rows.map((row) => [row.matcher, row.negated === true ? "not" : "", String(row.actual), row]),
  )("%s %s on %s", (_matcher, _not, _actual, row) => {
    const inShim = outcomeOf(() => runRow(shimExpect(row.actual), row));
    const inVitest = outcomeOf(() => runRow(expect(row.actual), row));
    expect(inShim).toBe(inVitest);
  });

  it("has a passing and a failing row for every matcher the shim has", () => {
    for (const name of matcherNames) {
      const outcomes = rows
        .filter((row) => row.matcher === name)
        .map((row) => outcomeOf(() => runRow(shimExpect(row.actual), row)));
      expect(outcomes, name).toContain("passes");
      expect(outcomes, name).toContain("fails");
    }
  });
});
