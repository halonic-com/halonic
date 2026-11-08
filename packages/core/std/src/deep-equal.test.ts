import { describe, expect, it } from "vitest";
import { deepEqual } from "./deep-equal.ts";

describe("std.deep-equal", () => {
  it("compares primitives by value", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(1, "1")).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(0, -0)).toBe(true);
  });

  it("treats NaN as equal to NaN", () => {
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(deepEqual(Number.NaN, 1)).toBe(false);
  });

  it("compares plain objects key by key, in any order", () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
  });

  it("counts a key whose value is undefined", () => {
    expect(deepEqual({ a: undefined }, {})).toBe(false);
    expect(deepEqual({ a: undefined }, { b: undefined })).toBe(false);
  });

  it("compares arrays item by item, in order", () => {
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1], [1, 1])).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });

  it("compares dates by time", () => {
    expect(deepEqual(new Date(5), new Date(5))).toBe(true);
    expect(deepEqual(new Date(5), new Date(6))).toBe(false);
    expect(deepEqual(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
  });

  it("treats objects without a prototype as plain", () => {
    const bare = Object.create(null);
    bare.a = 1;
    expect(deepEqual(bare, { a: 1 })).toBe(true);
  });

  it("compares other objects by identity only", () => {
    const map = new Map([["a", 1]]);
    expect(deepEqual(map, map)).toBe(true);
    expect(deepEqual(map, new Map([["a", 1]]))).toBe(false);
    expect(deepEqual(new Date(1), { time: 1 })).toBe(false);
  });
});
