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
    expect(() => shimExpect(0).toBeGreaterThanOrEqual(1)).toThrow(
      new AssertionError("expected 0 to be greater than or equal to 1"),
    );
  });

  it("throws a TypeError for values it can't compare, with or without not", () => {
    expect(() => shimExpect(new Date(0)).toBeGreaterThanOrEqual(0)).toThrow(
      new TypeError(
        "actual value must be number or bigint, received Date(1970-01-01T00:00:00.000Z)",
      ),
    );
    expect(() => shimExpect([]).not.toBeGreaterThanOrEqual(1)).toThrow(TypeError);
    const notANumber = "0" as unknown as number;
    expect(() => shimExpect(1).not.toBeGreaterThanOrEqual(notANumber)).toThrow(
      new TypeError('expected value must be number or bigint, received "0"'),
    );
  });

  it("starts the failure text with the message given to expect", () => {
    expect(() => shimExpect(1, "retries").toBe(2)).toThrow("retries: expected 1 to be 2");
  });

  it("negates every matcher under not", () => {
    shimExpect({}).not.toBe({});
    shimExpect(0).not.toBeNull();
    expect(() => shimExpect(null).not.toBeNull()).toThrow("expected null not to be null");
    expect(() => shimExpect(new Date(Number.NaN)).not.toBeUndefined()).not.toThrow();
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

  it("puts the caller's message first in a failure, as Vitest does", () => {
    expect(() => shimExpect(1, "media type").toBeNull()).toThrow(
      "media type: expected 1 to be null",
    );
    expect(() => shimExpect(() => {}).toThrow(RangeError)).toThrow(
      "expected a function to throw RangeError",
    );
  });

  it("checks what a promise rejected with under rejects, and fails when it resolves", async () => {
    await shimExpect(Promise.reject(new RangeError("bad"))).rejects.toThrow(RangeError);
    await shimExpect(() => Promise.reject(new RangeError("bad"))).rejects.not.toThrow(TypeError);
    await expect(shimExpect(Promise.resolve(3), "put").rejects.toThrow()).rejects.toThrow(
      "put: promise resolved 3 instead of rejecting",
    );
    expect(() => shimExpect(3).rejects).toThrow(
      "You must provide a Promise to expect() when using .rejects, not 'number'.",
    );
  });

  it("counts one assertion for a check under rejects", async () => {
    const counted = createExpect();
    await counted(Promise.reject(new Error("x"))).rejects.toThrow("x");
    expect(counted.getState().assertionCalls).toBe(1);
  });

  it("lists its matchers for the build's check", () => {
    expect(matcherNames).toEqual([
      "toBe",
      "toEqual",
      "toMatchObject",
      "toHaveLength",
      "toBeGreaterThanOrEqual",
      "toBeNull",
      "toBeUndefined",
      "toThrow",
    ]);
  });
});
