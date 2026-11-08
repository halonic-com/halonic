import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { compact } from "./compact.ts";
import golden from "./golden/compact.json" with { type: "json" };
import { decodeUndefined } from "./test/golden.ts";

// The golden file is what the old app's compact (commit 784f78d) returned for each input.

verifies("format.compact", () => {
  test("leaves out undefined values, empty arrays and empty objects", () => {
    expect(compact({ name: "triage", tags: [], layout: {}, note: undefined })).toStrictEqual({
      name: "triage",
    });
  });

  test("leaves out a value that compacting empties", () => {
    expect(compact({ a: { b: [] }, keep: 1 })).toStrictEqual({ keep: 1 });
  });

  test("keeps null, empty strings, zero and false", () => {
    const value = { n: null, s: "", z: 0, f: false };
    expect(compact(value)).toStrictEqual(value);
  });

  test("compacts array items but never removes one", () => {
    expect(compact({ list: [undefined, {}, [], { a: [] }] })).toStrictEqual({
      list: [undefined, {}, [], {}],
    });
  });

  test("keeps the value passed in even when it ends up empty", () => {
    expect(compact({})).toStrictEqual({});
    expect(compact({ a: {} })).toStrictEqual({});
    expect(compact([])).toStrictEqual([]);
    expect(compact(undefined)).toBeUndefined();
  });

  test("returns a new value and leaves the input as it was", () => {
    const input = { steps: [{ id: "a", on: [] }], meta: { tags: ["x"] } };
    const before = structuredClone(input);
    const result = compact(input) as typeof input;
    expect(input).toStrictEqual(before);
    expect(result.steps).not.toBe(input.steps);
    expect(result.meta.tags).not.toBe(input.meta.tags);
  });

  // Allowed difference: the old app turned these into {} and dropped them.
  test("refuses any object that isn't a plain object or an array, and says where it is", () => {
    class Step {}
    expect(() => compact({ at: new Date(5), keep: 1 })).toThrow(
      new TypeError("compact writes plain data only, but value.at is a Date."),
    );
    expect(() => compact({ steps: [{ seen: new Map() }] })).toThrow(
      new TypeError("compact writes plain data only, but value.steps[0].seen is a Map."),
    );
    expect(() => compact([new Step()])).toThrow(
      new TypeError("compact writes plain data only, but value[0] is a Step."),
    );
  });

  test("names objects with no class, or an unnamed one, in words", () => {
    expect(() => compact({ a: Object.create({}) })).toThrow(
      new TypeError(
        "compact writes plain data only, but value.a is an object with a custom prototype.",
      ),
    );
    const Unnamed = (() => class {})();
    expect(() => compact([new Unnamed()])).toThrow(
      new TypeError(
        "compact writes plain data only, but value[0] is an instance of an unnamed class.",
      ),
    );
  });

  test("quotes keys in the path that aren't simple identifiers", () => {
    expect(() => compact({ "a.b": { "0": new Map() } })).toThrow(
      new TypeError('compact writes plain data only, but value["a.b"]["0"] is a Map.'),
    );
  });

  test("compacts objects without a prototype, as Object.create(null) makes them", () => {
    const input = Object.assign(Object.create(null), { name: "triage", tags: [] });
    expect(compact(input)).toStrictEqual({ name: "triage" });
  });

  // Allowed difference: the old app assigned the key, which set the result's prototype instead.
  test("keeps a __proto__ key from JSON as an ordinary key", () => {
    const result = compact(JSON.parse('{"__proto__": {"a": 1}, "empty": []}')) as object;
    expect(Object.keys(result)).toStrictEqual(["__proto__"]);
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toStrictEqual({ a: 1 });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect("a" in result).toBe(false);
    expect(Object.prototype).not.toHaveProperty("a");
  });

  describe("matches the old app's compact", () => {
    test.each(golden.cases)("$name", ({ input, output }) => {
      const result = compact(decodeUndefined(input));
      const expected = decodeUndefined(output);
      expect(result).toStrictEqual(expected);
      // toStrictEqual ignores key order, but the order is what the file shows.
      expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
    });

    test("covers every rule and the four example files", () => {
      const rules = new Set(golden.cases.map((goldenCase) => goldenCase.rule));
      expect([...rules].sort()).toStrictEqual([
        "compact-first",
        "drop-empty-array",
        "drop-empty-object",
        "drop-undefined",
        "example-file",
        "keep-array-items",
        "keep-falsy",
        "keep-top-level",
        "key-order",
      ]);
      const examples = golden.cases.filter((goldenCase) => goldenCase.rule === "example-file");
      expect(examples.map((example) => example.name)).toStrictEqual([
        "acme workspace",
        "acme support agent",
        "acme triage workflow",
        "acme daily-digest routine",
      ]);
    });
  });
});
