import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type Issue, parse, type Schema, s } from "./index.ts";

function issuesOf(result: { ok: true } | { ok: false; error: Issue[] }): Issue[] {
  return result.ok ? [] : result.error;
}

verifies("schema-kit.builders", () => {
  it("offers exactly the builders the file format uses", () => {
    expect(Object.keys(s).sort()).toEqual([
      "array",
      "boolean",
      "discriminatedUnion",
      "enum",
      "intersection",
      "lazy",
      "literal",
      "null",
      "number",
      "object",
      "record",
      "string",
      "tuple",
      "union",
      "unknown",
    ]);
  });

  it("reports unknown keys of a strict object with the keys", () => {
    const schema = s.object({ name: s.string().min(1) }).strict();
    const issues = issuesOf(parse(schema, { name: "a", extra: 1 }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "unrecognized_keys", path: [], keys: ["extra"] });
  });

  it("picks the option of a discriminated union by its key", () => {
    const schema = s.discriminatedUnion("type", [
      s.object({ type: s.literal("a"), size: s.number() }),
      s.object({ type: s.literal("b") }),
    ]);
    expect(parse(schema, { type: "b" }).ok).toBe(true);
    expect(issuesOf(parse(schema, { type: "a" })).map((issue) => issue.path)).toEqual([["size"]]);
  });

  it("checks the scalar refinements the old schemas use", () => {
    const cases: [Schema, unknown, boolean][] = [
      [s.string().min(2), "a", false],
      [s.string().max(2), "abc", false],
      [s.string().regex(/^[a-z]+$/), "abc", true],
      [s.string().email(), "family@example.com", true],
      [s.string().url(), "not a url", false],
      [s.number().int(), 1.5, false],
      [s.number().positive(), 0, false],
    ];
    for (const [schema, input, passes] of cases) expect(parse(schema, input).ok).toBe(passes);
  });

  it("keeps unknown keys of a passthrough object and drops them otherwise", () => {
    const shape = { a: s.number() };
    expect(parse(s.object(shape).passthrough(), { a: 1, b: 2 })).toEqual({
      ok: true,
      value: { a: 1, b: 2 },
    });
    expect(parse(s.object(shape), { a: 1, b: 2 })).toEqual({ ok: true, value: { a: 1 } });
  });
});
