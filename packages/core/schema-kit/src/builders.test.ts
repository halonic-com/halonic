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
      "json",
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
      "url",
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

  it("accepts any JSON value with s.json and nothing else", () => {
    const schema = s.json();
    for (const value of [null, true, 1.5, "text", [1, "a"], { a: { b: [null] } }]) {
      expect(parse(schema, value).ok).toBe(true);
    }
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, { a: () => 1 }]) {
      expect(parse(schema, value).ok).toBe(false);
    }
  });

  it("accepts an http or https URL as URL writes it with s.url", () => {
    const accepted = [
      "https://api.example.com",
      "https://api.example.com/v1/messages",
      "http://localhost:11434/api/chat",
      "http://127.0.0.1:8080/",
      "http://[::1]:8080/mcp",
      "https://www.googleapis.com/drive/v3/files?q=%27root%27+in+parents&pageSize=300",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
      "https://example.com/a#part",
    ];
    for (const url of accepted) expect(parse(s.url(), url)).toEqual({ ok: true, value: url });
  });

  it("refuses with s.url what z.url() lets through", () => {
    const refused = [
      "mailto:family@example.com",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "HTTPS://api.example.com/",
      "https://API.example.com/",
      "https://user@example.com/",
      "https://example.com/a b",
      "https://ä.example.com/",
      "https://example.com/%zz",
      "https://-example.com/",
      "https://",
      "example.com/path",
    ];
    for (const url of refused) {
      expect(issuesOf(parse(s.url(), url))).toMatchObject([{ code: "invalid_format", path: [] }]);
    }
  });
});
