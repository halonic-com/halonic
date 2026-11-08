import { describe, expect, it } from "vitest";
import { type Issue, s } from "./index.ts";

function issuesOf(result: { ok: boolean; error?: Issue[] }): [string, unknown][] {
  const issues = result.ok ? [] : (result.error ?? []);
  return issues.map((issue) => [issue.code, issue.path]);
}

describe("schema-kit.array", () => {
  it("checks every item at its index", () => {
    expect(s.array(s.string()).parse(["a", "b"])).toEqual(["a", "b"]);
    expect(issuesOf(s.array(s.string()).safeParse(["a", 2, "c", null]))).toEqual([
      ["invalid_type", [1]],
      ["invalid_type", [3]],
    ]);
  });

  it("treats a hole in a list as undefined", () => {
    // biome-ignore lint/suspicious/noSparseArray: the hole is what this test is about.
    expect(issuesOf(s.array(s.number()).safeParse([1, , 3]))).toEqual([["invalid_type", [1]]]);
  });

  it("checks min and max", () => {
    expect(issuesOf(s.array(s.string()).min(1).safeParse([]))).toEqual([["too_small", []]]);
    expect(issuesOf(s.array(s.string()).max(1).safeParse(["a", "b"]))).toEqual([["too_big", []]]);
  });

  it("keeps the stricter of two limits", () => {
    expect(issuesOf(s.array(s.string()).min(3).min(1).safeParse(["a"]))).toEqual([
      ["too_small", []],
    ]);
    expect(issuesOf(s.array(s.string()).max(1).max(3).safeParse(["a", "b"]))).toEqual([
      ["too_big", []],
    ]);
  });

  it("checks the minimum even when items fail", () => {
    expect(issuesOf(s.array(s.string()).min(2).safeParse([1]))).toEqual([
      ["invalid_type", [0]],
      ["too_small", []],
    ]);
  });

  it("skips the minimum after a halting item issue, as Zod did", () => {
    expect(issuesOf(s.array(s.number().int()).min(2).safeParse([1.5]))).toEqual([
      ["not_integer", [0]],
    ]);
  });

  it("refuses a list over its maximum without reading its items", () => {
    const huge = new Array<string>(1_000_000).fill("x");
    expect(issuesOf(s.array(s.number()).max(2).safeParse(huge))).toEqual([["too_big", []]]);
  });

  it("refuses non-lists", () => {
    expect(issuesOf(s.array(s.string()).safeParse({ 0: "a" }))).toEqual([["invalid_type", []]]);
  });
});

describe("schema-kit.tuple", () => {
  const pair = s.tuple([s.unknown(), s.unknown()]);

  it("accepts one item per position", () => {
    expect(pair.parse([1, "b"])).toEqual([1, "b"]);
  });

  it("refuses a short list without checking its items", () => {
    expect(issuesOf(pair.safeParse([1]))).toEqual([["too_small", []]]);
  });

  it("reports a long list and still checks its items", () => {
    const typed = s.tuple([s.string(), s.number()]);
    expect(issuesOf(typed.safeParse([1, "a", 3]))).toEqual([
      ["too_big", []],
      ["invalid_type", [0]],
      ["invalid_type", [1]],
    ]);
  });

  it("lets optional items at the end be left off", () => {
    const withOptional = s.tuple([s.string(), s.number().optional()]);
    expect(withOptional.parse(["a"])).toEqual(["a"]);
    expect(issuesOf(withOptional.safeParse([]))).toEqual([["too_small", []]]);
    expect(s.tuple([s.string(), s.number().default(1)]).parse(["a"])).toEqual(["a", 1]);
  });
});

describe("schema-kit.record", () => {
  it("checks every key and value", () => {
    const counts = s.record(s.string().regex(/^[a-z]+$/), s.number());
    expect(counts.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(issuesOf(counts.safeParse({ ok: 1, Bad: "x" }))).toEqual([["invalid_key", ["Bad"]]]);
    expect(issuesOf(counts.safeParse({ a: "x" }))).toEqual([["invalid_type", ["a"]]]);
  });

  it("says why a key is invalid", () => {
    const result = s.record(s.string().min(2), s.number()).safeParse({ a: 1 });
    expect(result.ok ? "" : result.error[0]?.message).toBe(
      'Invalid key "a": Expected at least 2 characters',
    );
  });

  it("refuses lists and null", () => {
    expect(issuesOf(s.record(s.string(), s.unknown()).safeParse([]))).toEqual([
      ["invalid_type", []],
    ]);
    expect(issuesOf(s.record(s.string(), s.unknown()).safeParse(null))).toEqual([
      ["invalid_type", []],
    ]);
  });

  it("keeps values that are undefined", () => {
    const value = s.record(s.string(), s.unknown()).parse({ a: undefined });
    expect(Object.hasOwn(value, "a")).toBe(true);
  });
});
