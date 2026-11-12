import { describe, expect, it } from "vitest";
import { AssertionError, createExpect, matcherNames } from "./expect.ts";

describe("the shim's expect", () => {
  const shimExpect = createExpect();

  it("passes matching values and throws an AssertionError otherwise", () => {
    shimExpect(1).toBe(1);
    shimExpect(Number.NaN).toBe(Number.NaN);
    shimExpect(3).toBeGreaterThanOrEqual(3);
    shimExpect(4n).toBeGreaterThanOrEqual(2n);
    shimExpect(null).toBeNull();
    shimExpect(undefined).toBeUndefined();
    expect(() => shimExpect("a").toBe("b")).toThrow(new AssertionError('expected "a" to be "b"'));
    expect(() => shimExpect(new Date(0)).toBeGreaterThanOrEqual(0)).toThrow(
      "expected Date(1970-01-01T00:00:00.000Z) to be greater than or equal to 0",
    );
  });

  it("negates every matcher under not", () => {
    shimExpect({}).not.toBe({});
    shimExpect(0).not.toBeNull();
    expect(() => shimExpect(null).not.toBeNull()).toThrow("expected null not to be null");
    expect(() => shimExpect(new Date(Number.NaN)).not.toBeUndefined()).not.toThrow();
    expect(() => shimExpect([]).not.toBeGreaterThanOrEqual(1)).not.toThrow();
    expect(() => shimExpect(5n).not.toBe(5n)).toThrow("expected 5n not to be 5n");
  });

  it("counts calls and lets callers set the count, as verifies() and typeTest() do", () => {
    const counted = createExpect();
    counted(1).toBe(1);
    counted(2).not.toBe(1);
    expect(counted.getState()).toEqual({ assertionCalls: 2 });
    counted.setState({ assertionCalls: 7 });
    expect(counted.getState().assertionCalls).toBe(7);
  });

  it("lists its matchers for the build's check", () => {
    expect(matcherNames).toEqual(["toBe", "toBeGreaterThanOrEqual", "toBeNull", "toBeUndefined"]);
  });
});
