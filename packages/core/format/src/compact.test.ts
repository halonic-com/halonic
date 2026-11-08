import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { compact } from "./compact.ts";
import golden from "./golden/compact.json" with { type: "json" };

// The golden file is what the old app's compact (commit 784f78d) returned for
// each input. JSON has no undefined, so the recording writes it as a marker
// object; this turns the marker back into undefined.
function decodeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeUndefined);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (isUndefinedMarker(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, decodeUndefined(child)]),
  );
}

function isUndefinedMarker(value: object): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "$undefined";
}

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

  test("reads any other object, such as a Date, through its own keys, like the old app", () => {
    expect(compact({ at: new Date(5), keep: 1 })).toStrictEqual({ keep: 1 });
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
