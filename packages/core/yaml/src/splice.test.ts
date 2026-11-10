import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { YamlEdit } from "./edit-data.ts";
import { spliceEdit } from "./splice.ts";

const set = (path: YamlEdit["path"], value: unknown): YamlEdit => ({ kind: "set", path, value });

verifies("yaml.edit", () => {
  it("keeps every line break of a text that uses one line ending", () => {
    expect(spliceEdit("aa: 1\r\nb: 2\r\n", set(["aa"], 3))).toBe("aa: 3\r\nb: 2\r\n");
  });

  it("gives up on a text that mixes line endings", () => {
    expect(spliceEdit("aa: 1\r\nb: 2\n", set(["aa"], 3))).toBeUndefined();
  });

  it("gives up on an edit inside an empty flow collection", () => {
    expect(spliceEdit("t: []\n", set(["t", 0], 1))).toBeUndefined();
  });

  it("gives up on a flow edit the data refuses", () => {
    expect(spliceEdit("t: [a, b]\n", set(["t", "x"], 1))).toBeUndefined();
  });

  it("changes only the characters of a scalar in a flow collection", () => {
    expect(spliceEdit("t: [a,   b]\n", set(["t", 0], "c"))).toBe("t: [c,   b]\n");
    expect(spliceEdit("t: {aa: 1, b: 2}\n", set(["t", "aa"], 5))).toBe("t: {aa: 5, b: 2}\n");
  });

  it("writes a flow collection again when the scalar would not read back", () => {
    expect(spliceEdit("t: [a, b]\n", set(["t", 0], "x, y"))).toBe('t: ["x, y", b]\n');
  });

  it("writes a flow collection again for a collection value or another edit kind", () => {
    expect(spliceEdit("t: [a, b]\n", set(["t", 0], { k: 1 }))).toBe("t: [{k: 1}, b]\n");
    expect(spliceEdit("t: [a, b]\n", { kind: "delete", path: ["t", 0] })).toBe("t: [b]\n");
    expect(spliceEdit("t: [a, b]\n", { kind: "insert", path: ["t", 1], value: "z" })).toBe(
      "t: [a, z, b]\n",
    );
  });

  it("replaces a nested collection in a flow list with a scalar", () => {
    expect(spliceEdit("t: [[a], b]\n", set(["t", 0], "c"))).toBe("t: [c, b]\n");
  });

  it("returns the text itself when a set changes no data", () => {
    expect(spliceEdit("aa: 'x'\n", set(["aa"], "x"))).toBe("aa: 'x'\n");
    expect(spliceEdit("aa:\n  b:   1\n", set(["aa"], { b: 1 }))).toBe("aa:\n  b:   1\n");
  });

  it("diffs a map set key by key", () => {
    expect(spliceEdit("aa:\n  b: 1\n  c: 2\n", set(["aa"], { b: 1, c: 3 }))).toBe(
      "aa:\n  b: 1\n  c: 3\n",
    );
    expect(spliceEdit("aa:\n  b: 1\n  c: 2\n", set(["aa"], { b: 1, d: 3 }))).toBe(
      "aa:\n  b: 1\n  d: 3\n",
    );
    expect(spliceEdit("aa:\n  b: 1\n", set(["aa"], { toString: 1 }))).toBe("aa:\n  toString: 1\n");
  });

  it("diffs a list set item by item", () => {
    expect(spliceEdit("aa:\n  - 1\n  - 2\n", set(["aa"], [1, 3, 4]))).toBe(
      "aa:\n  - 1\n  - 3\n  - 4\n",
    );
    expect(spliceEdit("aa:\n  - 1\n  - 2\n  - 3\n", set(["aa"], [1]))).toBe("aa:\n  - 1\n");
    expect(spliceEdit("aa:\n  - 1\n  - 2\n", set(["aa"], [1, 2, 3]))).toBe(
      "aa:\n  - 1\n  - 2\n  - 3\n",
    );
  });

  it("writes an empty collection, or one of another kind, in one piece", () => {
    expect(spliceEdit("aa:\n  b: 1\n", set(["aa"], {}))).toBe("aa: {}\n");
    expect(spliceEdit("aa:\n  - 1\n", set(["aa"], []))).toBe("aa: []\n");
    expect(spliceEdit("aa:\n  - 1\n", set(["aa"], { b: 1 }))).toBe("aa:\n  b: 1\n");
    expect(spliceEdit("aa:\n  b: 1\n", set(["aa"], [1]))).toBe("aa:\n  - 1\n");
    expect(spliceEdit("aa: {}\n", set(["aa"], { x: 1 }))).toBe("aa:\n  x: 1\n");
    expect(spliceEdit("aa: []\n", set(["aa"], [1]))).toBe("aa:\n  - 1\n");
  });

  it("builds the maps under an empty value, but not under text that says null", () => {
    expect(spliceEdit("", set(["aa", "b"], 1))).toBe("aa:\n  b: 1\n");
    expect(spliceEdit("aa:\nb: 1\n", set(["aa", "c"], 1))).toBe("aa:\n  c: 1\nb: 1\n");
    expect(spliceEdit("aa: null\n", set(["aa", "c"], 1))).toBe("aa:\n  c: 1\n");
    expect(spliceEdit("aa: 'null'\n", set(["aa", "c"], 1))).toBeUndefined();
  });
});
