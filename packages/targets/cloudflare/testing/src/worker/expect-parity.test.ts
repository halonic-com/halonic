import { describe, expect, it } from "vitest";
import { createExpect, type Matchers, matcherNames } from "./expect.ts";

/**
 * One input for a matcher: the value under test, the matcher's argument and
 * whether the check is negated with `not`. Every row runs through the shim
 * and through Vitest, and both must agree on the outcome: a pass, a failed
 * check, or a `TypeError` for a value the matcher can't check.
 */
interface ParityRow {
  readonly matcher: keyof Matchers;
  readonly actual: unknown;
  readonly expected?: unknown;
  readonly negated?: boolean;
}

const sharedObject = { name: "acme" };
const symbolKey = Symbol("key");

class StoreError extends Error {
  override readonly name = "StoreError";
}

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
  { matcher: "toEqual", actual: { a: 1, b: [1, 2] }, expected: { b: [1, 2], a: 1 } },
  { matcher: "toEqual", actual: { a: 1 }, expected: { a: 2 } },
  { matcher: "toEqual", actual: { a: 1, b: undefined }, expected: { a: 1 } },
  { matcher: "toEqual", actual: { a: 1 }, expected: { a: 1, b: 2 } },
  { matcher: "toEqual", actual: [1, 2], expected: [1, 2, 3] },
  { matcher: "toEqual", actual: [1], expected: { 0: 1 } },
  { matcher: "toEqual", actual: Number.NaN, expected: Number.NaN },
  { matcher: "toEqual", actual: 0, expected: -0 },
  { matcher: "toEqual", actual: null, expected: undefined },
  { matcher: "toEqual", actual: new StoreError("gone"), expected: { name: "acme" }, negated: true },
  { matcher: "toEqual", actual: new Uint8Array([1, 2]), expected: new Uint8Array([1, 2]) },
  { matcher: "toEqual", actual: new Uint8Array([1, 2]), expected: new Uint8Array([1, 3]) },
  { matcher: "toEqual", actual: new Uint8Array(0), expected: new Uint16Array(0) },
  { matcher: "toEqual", actual: new Uint8Array([1]), expected: [1] },
  { matcher: "toEqual", actual: new Date(5), expected: new Date(5) },
  { matcher: "toEqual", actual: new Date(5), expected: new Date(6) },
  { matcher: "toEqual", actual: new Date(Number.NaN), expected: new Date(Number.NaN) },
  { matcher: "toEqual", actual: /a/g, expected: /a/g },
  { matcher: "toEqual", actual: /a/g, expected: /a/i },
  { matcher: "toEqual", actual: new Map([["k", { v: 1 }]]), expected: new Map([["k", { v: 1 }]]) },
  { matcher: "toEqual", actual: new Map([["k", 1]]), expected: new Map([["k", 2]]) },
  { matcher: "toEqual", actual: new Set([{ v: 1 }]), expected: new Set([{ v: 1 }]) },
  { matcher: "toEqual", actual: new Set([1]), expected: new Set([2]) },
  { matcher: "toEqual", actual: new StoreError("gone"), expected: new StoreError("gone") },
  { matcher: "toEqual", actual: new StoreError("gone"), expected: new StoreError("lost") },
  { matcher: "toEqual", actual: new StoreError("gone"), expected: new Error("gone") },
  { matcher: "toEqual", actual: { [symbolKey]: 1 }, expected: { [symbolKey]: 2 } },
  { matcher: "toEqual", actual: { at: new Date(1) }, expected: { at: new Date(1) }, negated: true },
  { matcher: "toBeGreaterThanOrEqual", actual: 2, expected: 1 },
  { matcher: "toBeGreaterThanOrEqual", actual: 1, expected: 1 },
  { matcher: "toBeGreaterThanOrEqual", actual: 0, expected: 1 },
  { matcher: "toBeGreaterThanOrEqual", actual: 3n, expected: 2n },
  { matcher: "toBeGreaterThanOrEqual", actual: Number.NaN, expected: 0 },
  { matcher: "toBeGreaterThanOrEqual", actual: 0, expected: 1, negated: true },
  { matcher: "toBeGreaterThanOrEqual", actual: new Date(0), expected: 0 },
  { matcher: "toBeGreaterThanOrEqual", actual: new Date(0), expected: 0, negated: true },
  { matcher: "toBeGreaterThanOrEqual", actual: [], expected: 1, negated: true },
  { matcher: "toBeGreaterThanOrEqual", actual: 1, expected: "0" },
  { matcher: "toBeGreaterThanOrEqual", actual: 1, expected: "0", negated: true },
  { matcher: "toBeNull", actual: null },
  { matcher: "toBeNull", actual: undefined },
  { matcher: "toBeNull", actual: 0, negated: true },
  { matcher: "toBeUndefined", actual: undefined },
  { matcher: "toBeUndefined", actual: null },
  { matcher: "toBeUndefined", actual: "", negated: true },
];

type Outcome = "passes" | "fails" | "throws a TypeError";

function outcomeOf(check: () => void): Outcome {
  try {
    check();
    return "passes";
  } catch (error) {
    return error instanceof TypeError ? "throws a TypeError" : "fails";
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
