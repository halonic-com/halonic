import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isPlainObject } from "./plain-data.ts";

verifies("std.is-plain-object", () => {
  it("accepts objects made by {}, Object.create(null) and JSON.parse", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(JSON.parse('{"a": 1}'))).toBe(true);
  });

  it("refuses arrays, dates, maps and class instances", () => {
    class Step {}
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date(0))).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Step())).toBe(false);
  });

  it("refuses null and primitives", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(1)).toBe(false);
  });
});
