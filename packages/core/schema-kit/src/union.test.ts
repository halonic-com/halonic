import { describe, expect, it } from "vitest";
import { type Issue, s } from "./index.ts";

function issuesOf(result: { ok: boolean; error?: Issue[] }): [string, unknown][] {
  const issues = result.ok ? [] : (result.error ?? []);
  return issues.map((issue) => [issue.code, issue.path]);
}

describe("schema-kit.union", () => {
  const textOrNumber = s.union([s.string(), s.number()]);

  it("returns the first option that matches", () => {
    expect(textOrNumber.parse(5)).toBe(5);
    expect(textOrNumber.parse("a")).toBe("a");
    expect(s.union([s.string().default("x"), s.string()]).parse(undefined)).toBe("x");
  });

  it("reports one no_union_match when no option comes close", () => {
    expect(issuesOf(textOrNumber.safeParse(true))).toEqual([["no_union_match", []]]);
  });

  it("reports the issues of the one option that failed only on checks", () => {
    const schema = s.union([s.object({ a: s.string().min(5) }), s.number()]);
    expect(issuesOf(schema.safeParse({ a: "x" }))).toEqual([["too_small", ["a"]]]);
  });

  it("reports no_union_match when two options failed only on checks", () => {
    const schema = s.union([s.string().min(5), s.string().max(0)]);
    expect(issuesOf(schema.safeParse("ab"))).toEqual([["no_union_match", []]]);
  });

  it("lets an object leave the key out when an option is optional", () => {
    const schema = s.object({ a: s.union([s.string(), s.number().optional()]) });
    expect(schema.parse({})).toEqual({});
  });
});

describe("schema-kit.discriminated-union", () => {
  const output = s.discriminatedUnion("type", [
    s.object({ type: s.literal("text") }).strict(),
    s.object({ type: s.literal("choice"), options: s.array(s.string()).min(1) }).strict(),
    s
      .object({ type: s.literal("json"), schema: s.record(s.string(), s.unknown()).optional() })
      .strict(),
  ]);

  it("checks the map with the option its key picks", () => {
    expect(output.parse({ type: "choice", options: ["a"] })).toEqual({
      type: "choice",
      options: ["a"],
    });
    expect(issuesOf(output.safeParse({ type: "choice", options: [] }))).toEqual([
      ["too_small", ["options"]],
    ]);
  });

  it("reports an unknown value at the key", () => {
    const result = output.safeParse({ type: "other" });
    expect(issuesOf(result)).toEqual([["unknown_discriminator", ["type"]]]);
    expect(result.ok ? "" : result.error[0]?.message).toBe(
      'Expected "type" to be one of: text, choice, json',
    );
    expect(issuesOf(output.safeParse({}))).toEqual([["unknown_discriminator", ["type"]]]);
  });

  it("refuses non-maps", () => {
    expect(issuesOf(output.safeParse([]))).toEqual([["invalid_type", []]]);
  });

  it("accepts an enum as the key's schema", () => {
    const shapes = s.discriminatedUnion("kind", [
      s.object({ kind: s.enum(["circle", "dot"]), radius: s.number() }),
      s.object({ kind: s.literal("square"), side: s.number() }),
    ]);
    expect(shapes.parse({ kind: "dot", radius: 1 })).toEqual({ kind: "dot", radius: 1 });
  });

  it("refuses options that share a value or lack a literal key", () => {
    expect(() =>
      s.discriminatedUnion("type", [
        s.object({ type: s.literal("a") }),
        s.object({ type: s.literal("a") }),
      ]),
    ).toThrow('Two options use type: "a"');
    expect(() => s.discriminatedUnion("type", [s.object({ type: s.string() })])).toThrow(
      /s\.literal\(\) or s\.enum\(\)/,
    );
  });
});

describe("schema-kit.intersection", () => {
  const seed = s.intersection(
    s.record(s.string(), s.unknown()),
    s.object({ id: s.string().min(1) }),
  );

  it("merges the two parsed maps", () => {
    expect(seed.parse({ id: "r1", amount: 5 })).toEqual({ id: "r1", amount: 5 });
  });

  it("reports the problems of both sides", () => {
    expect(issuesOf(seed.safeParse({ id: "" }))).toEqual([["too_small", ["id"]]]);
    expect(issuesOf(seed.safeParse(5))).toEqual([
      ["invalid_type", []],
      ["invalid_type", []],
    ]);
  });

  it("merges nested maps and lists", () => {
    const schema = s.intersection(
      s.object({ a: s.object({ x: s.number() }).passthrough(), list: s.array(s.unknown()) }),
      s.object({ a: s.object({ y: s.number() }).passthrough(), list: s.array(s.unknown()) }),
    );
    expect(schema.parse({ a: { x: 1, y: 2 }, list: [1, 2] })).toEqual({
      a: { x: 1, y: 2 },
      list: [1, 2],
    });
  });

  it("reports intersection_conflict when the parsed values disagree", () => {
    const schema = s.intersection(
      s.object({ a: s.string().default("x") }),
      s.object({ a: s.string().default("y") }),
    );
    expect(issuesOf(schema.safeParse({}))).toEqual([["intersection_conflict", []]]);
    const lists = s.intersection(
      s.array(s.unknown()).default([1]),
      s.array(s.unknown()).default([1, 2]),
    );
    expect(issuesOf(lists.safeParse(undefined))).toEqual([["intersection_conflict", []]]);
    const items = s.intersection(
      s.array(s.unknown()).default([1]),
      s.array(s.unknown()).default([2]),
    );
    expect(issuesOf(items.safeParse(undefined))).toEqual([["intersection_conflict", []]]);
  });

  it("treats NaN on both sides as the same value", () => {
    const schema = s.intersection(s.record(s.string(), s.unknown()), s.object({}).passthrough());
    expect(schema.safeParse({ a: Number.NaN }).ok).toBe(true);
  });
});
