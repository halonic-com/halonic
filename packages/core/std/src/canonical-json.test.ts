import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.ts";

verifies("std.canonical-json", () => {
  it("sorts object keys at every depth and keeps arrays in order", () => {
    expect(canonicalJson({ b: [2, 1], a: { d: true, c: null } })).toBe(
      '{"a":{"c":null,"d":true},"b":[2,1]}',
    );
  });

  it("gives the same text for the same data in any key order", () => {
    expect(canonicalJson({ x: 1, y: "2" })).toBe(canonicalJson({ y: "2", x: 1 }));
  });

  it("sorts keys by code unit, not by locale", () => {
    expect(canonicalJson({ b: 1, B: 2, ä: 3 })).toBe('{"B":2,"b":1,"ä":3}');
  });

  it("leaves out an object key whose value is undefined", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("keeps an argument with a space apart from two arguments", () => {
    expect(canonicalJson(["a b"])).not.toBe(canonicalJson(["a", "b"]));
  });

  it("refuses data JSON can't hold, saying where it is", () => {
    expect(() => canonicalJson({ cost: Number.NaN })).toThrow(
      "Can't write value.cost as JSON: NaN isn't a finite number.",
    );
    expect(() => canonicalJson({ list: [undefined] })).toThrow(
      "Can't write value.list[0] as JSON: it is undefined.",
    );
    expect(() => canonicalJson({ "a.b": new Map() })).toThrow(
      'Can\'t write value["a.b"] as JSON: it is a Map.',
    );
    expect(() => canonicalJson(1n)).toThrow("Can't write value as JSON: it is a bigint.");
  });
});
