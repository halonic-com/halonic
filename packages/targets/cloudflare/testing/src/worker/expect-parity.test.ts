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

/** A row for `rejects`: `settle` makes a fresh promise for each run. */
interface RejectionRow extends Omit<ParityRow, "actual"> {
  readonly settle: () => Promise<unknown>;
}

const sharedObject = { name: "acme" };
const symbolKey = Symbol("key");

class StoreError extends Error {
  override readonly name = "StoreError";
}

const throwing =
  (error: unknown): (() => never) =>
  () => {
    throw error;
  };
const fine = (): void => {};

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
  { matcher: "toMatchObject", actual: { a: 1, b: { c: 2, d: 3 } }, expected: { b: { c: 2 } } },
  { matcher: "toMatchObject", actual: { a: 1 }, expected: { a: 2 } },
  { matcher: "toMatchObject", actual: { a: 1 }, expected: { b: 1 } },
  { matcher: "toMatchObject", actual: { a: 1 }, expected: { b: undefined } },
  { matcher: "toMatchObject", actual: { a: undefined }, expected: { a: undefined } },
  { matcher: "toMatchObject", actual: { a: 1 }, expected: { a: 1 }, negated: true },
  { matcher: "toMatchObject", actual: [{ a: 1, b: 2 }], expected: [{ a: 1 }] },
  { matcher: "toMatchObject", actual: [{ a: 1 }, { a: 2 }], expected: [{ a: 1 }] },
  { matcher: "toMatchObject", actual: { list: [1, 2] }, expected: { list: [1] } },
  { matcher: "toMatchObject", actual: { at: new Date(5) }, expected: { at: new Date(5) } },
  { matcher: "toMatchObject", actual: { at: new Date(5) }, expected: { at: new Date(6) } },
  { matcher: "toMatchObject", actual: { a: { b: 1 } }, expected: { a: 1 } },
  { matcher: "toMatchObject", actual: { a: 1 }, expected: { a: { b: 1 } } },
  { matcher: "toMatchObject", actual: { [symbolKey]: 1, a: 2 }, expected: { [symbolKey]: 1 } },
  { matcher: "toMatchObject", actual: 1, expected: { a: 1 } },
  { matcher: "toMatchObject", actual: 1, expected: { a: 1 }, negated: true },
  { matcher: "toMatchObject", actual: { a: 1 }, expected: 1 },
  { matcher: "toMatchObject", actual: { a: 1 }, expected: null, negated: true },
  { matcher: "toHaveLength", actual: [1, 2], expected: 2 },
  { matcher: "toHaveLength", actual: [1, 2], expected: 3 },
  { matcher: "toHaveLength", actual: "acme", expected: 4 },
  { matcher: "toHaveLength", actual: new Uint8Array(3), expected: 3 },
  { matcher: "toHaveLength", actual: [], expected: 0, negated: true },
  { matcher: "toHaveLength", actual: { length: 2 }, expected: 2 },
  { matcher: "toHaveLength", actual: 5, expected: 5 },
  { matcher: "toHaveLength", actual: null, expected: 0 },
  { matcher: "toHaveLength", actual: undefined, expected: 0, negated: true },
  { matcher: "toContain", actual: ["a", "b"], expected: "b" },
  { matcher: "toContain", actual: ["a", "b"], expected: "c" },
  { matcher: "toContain", actual: [{ a: 1 }], expected: { a: 1 } },
  { matcher: "toContain", actual: [Number.NaN], expected: Number.NaN },
  { matcher: "toContain", actual: ["a"], expected: "a", negated: true },
  { matcher: "toContain", actual: new Set(["a"]), expected: "a" },
  { matcher: "toContain", actual: new Set(["a"]), expected: "b" },
  { matcher: "toContain", actual: "stored blob", expected: "blob" },
  { matcher: "toContain", actual: "stored blob", expected: "hash" },
  { matcher: "toContain", actual: "stored blob", expected: 1 },
  { matcher: "toContain", actual: 42, expected: 4 },
  { matcher: "toContain", actual: 42, expected: 4, negated: true },
  { matcher: "toMatch", actual: "stored blob", expected: "blob" },
  { matcher: "toMatch", actual: "stored blob", expected: "hash" },
  { matcher: "toMatch", actual: "$pbkdf2-sha256-chain$i=1", expected: /^\$pbkdf2-sha256-chain\$/u },
  { matcher: "toMatch", actual: "stored blob", expected: /^blob/u },
  { matcher: "toMatch", actual: "stored blob", expected: /^stored/u, negated: true },
  { matcher: "toMatch", actual: 42, expected: "4" },
  { matcher: "toMatch", actual: 42, expected: "4", negated: true },
  { matcher: "toMatch", actual: "stored blob", expected: 1 },
  { matcher: "toMatch", actual: "stored blob", expected: 1, negated: true },
  { matcher: "toBeInstanceOf", actual: new RangeError("x"), expected: RangeError },
  { matcher: "toBeInstanceOf", actual: new RangeError("x"), expected: Error },
  { matcher: "toBeInstanceOf", actual: new RangeError("x"), expected: TypeError },
  { matcher: "toBeInstanceOf", actual: new RangeError("x"), expected: TypeError, negated: true },
  { matcher: "toBeInstanceOf", actual: "x", expected: String },
  { matcher: "toBeInstanceOf", actual: new RangeError("x"), expected: "RangeError" },
  { matcher: "toBeInstanceOf", actual: new RangeError("x"), expected: "RangeError", negated: true },
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
  { matcher: "toBeLessThanOrEqual", actual: 1, expected: 2 },
  { matcher: "toBeLessThanOrEqual", actual: 1, expected: 1 },
  { matcher: "toBeLessThanOrEqual", actual: 2, expected: 1 },
  { matcher: "toBeLessThanOrEqual", actual: 2n, expected: 3n },
  { matcher: "toBeLessThanOrEqual", actual: Number.NaN, expected: 0 },
  { matcher: "toBeLessThanOrEqual", actual: 2, expected: 1, negated: true },
  { matcher: "toBeLessThanOrEqual", actual: new Date(0), expected: 0 },
  { matcher: "toBeLessThanOrEqual", actual: [], expected: 1, negated: true },
  { matcher: "toBeLessThanOrEqual", actual: 1, expected: "2" },
  { matcher: "toBeNull", actual: null },
  { matcher: "toBeNull", actual: undefined },
  { matcher: "toBeNull", actual: 0, negated: true },
  { matcher: "toBeUndefined", actual: undefined },
  { matcher: "toBeUndefined", actual: null },
  { matcher: "toBeUndefined", actual: "", negated: true },
  { matcher: "toThrow", actual: throwing(new RangeError("bad media type")) },
  { matcher: "toThrow", actual: fine },
  { matcher: "toThrow", actual: fine, negated: true },
  { matcher: "toThrow", actual: throwing(new RangeError("bad media type")), expected: "media" },
  { matcher: "toThrow", actual: throwing(new RangeError("bad media type")), expected: "hash" },
  { matcher: "toThrow", actual: throwing("plain text"), expected: "plain" },
  { matcher: "toThrow", actual: throwing(new RangeError("bad media type")), expected: /^bad/ },
  { matcher: "toThrow", actual: throwing(new RangeError("bad media type")), expected: /^good/ },
  { matcher: "toThrow", actual: throwing(new RangeError("bad")), expected: RangeError },
  { matcher: "toThrow", actual: throwing(new RangeError("bad")), expected: Error },
  { matcher: "toThrow", actual: throwing(new RangeError("bad")), expected: TypeError },
  {
    matcher: "toThrow",
    actual: throwing(new StoreError("gone")),
    expected: new StoreError("gone"),
  },
  {
    matcher: "toThrow",
    actual: throwing(new StoreError("gone")),
    expected: new StoreError("lost"),
  },
  {
    matcher: "toThrow",
    actual: throwing(new RangeError("bad")),
    expected: TypeError,
    negated: true,
  },
  { matcher: "toThrow", actual: fine, expected: TypeError, negated: true },
  { matcher: "toThrow", actual: 42 },
  { matcher: "toThrow", actual: 42, negated: true },
  { matcher: "toThrow", actual: 42, expected: "not a function", negated: true },
  { matcher: "toThrow", actual: 42, expected: TypeError },
  { matcher: "toThrow", actual: 42, expected: RangeError, negated: true },
];

/** Rows for `expect(promise).rejects`. */
const rejectionRows: readonly RejectionRow[] = [
  { matcher: "toThrow", settle: () => Promise.reject(new RangeError("bad")), expected: RangeError },
  { matcher: "toThrow", settle: () => Promise.reject(new RangeError("bad")), expected: TypeError },
  {
    matcher: "toThrow",
    settle: () => Promise.reject(new RangeError("bad type")),
    expected: "type",
  },
  { matcher: "toThrow", settle: () => Promise.resolve("stored"), expected: RangeError },
  { matcher: "toThrow", settle: () => Promise.resolve("stored"), negated: true },
  {
    matcher: "toThrow",
    settle: () => Promise.reject(new RangeError("bad")),
    expected: TypeError,
    negated: true,
  },
  { matcher: "toBe", settle: () => Promise.reject(7), expected: 7 },
  { matcher: "toEqual", settle: () => Promise.reject({ code: 1 }), expected: { code: 1 } },
  { matcher: "toEqual", settle: () => Promise.reject({ code: 1 }), expected: { code: 2 } },
];

type Outcome = "passes" | "fails" | "throws a TypeError";

async function outcomeOf(check: () => unknown): Promise<Outcome> {
  try {
    await check();
    return "passes";
  } catch (error) {
    return error instanceof TypeError ? "throws a TypeError" : "fails";
  }
}

/** The matcher a row names, on the matchers or under `not`, ready to call with the row's argument. */
function matcherFor<T>(
  matchers: Record<keyof Matchers, unknown> & { not: unknown },
  row: Omit<ParityRow, "actual">,
): () => T {
  const chosen = (row.negated === true ? matchers.not : matchers) as Record<string, unknown>;
  const matcher = chosen[row.matcher] as (expected?: unknown) => T;
  return () => matcher.call(chosen, row.expected);
}

function describeRow(row: Omit<ParityRow, "actual">, actual: string): unknown[] {
  return [row.matcher, row.negated === true ? "not" : "", actual, row];
}

describe("the shim's matchers agree with Vitest's", () => {
  const shimExpect = createExpect();

  it.each(rows.map((row) => describeRow(row, String(row.actual))))(
    "%s %s on %s",
    async (_matcher, _not, _actual, row) => {
      const parityRow = row as ParityRow;
      const inShim = await outcomeOf(matcherFor(shimExpect(parityRow.actual), parityRow));
      const inVitest = await outcomeOf(matcherFor(expect(parityRow.actual), parityRow));
      expect(inShim).toBe(inVitest);
    },
  );

  it.each(rejectionRows.map((row) => describeRow(row, String(row.settle))))(
    "rejects %s %s on %s",
    async (_matcher, _not, _settle, row) => {
      const rejectionRow = row as RejectionRow;
      const inShim = await outcomeOf(
        matcherFor(shimExpect(rejectionRow.settle()).rejects, rejectionRow),
      );
      const inVitest = await outcomeOf(
        matcherFor(expect(rejectionRow.settle()).rejects, rejectionRow),
      );
      expect(inShim).toBe(inVitest);
    },
  );

  it("has a passing and a failing row for every matcher the shim has", async () => {
    for (const name of matcherNames) {
      const outcomes = await Promise.all(
        rows
          .filter((row) => row.matcher === name)
          .map((row) => outcomeOf(matcherFor(shimExpect(row.actual), row))),
      );
      expect(outcomes, name).toContain("passes");
      expect(outcomes, name).toContain("fails");
    }
  });
});
