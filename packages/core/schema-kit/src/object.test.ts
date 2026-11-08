import { describe, expect, it } from "vitest";
import { type Issue, s } from "./index.ts";

function issuesOf(result: { ok: boolean; error?: Issue[] }): Issue[] {
  return result.ok ? [] : (result.error ?? []);
}

describe("schema-kit.object", () => {
  const named = s.object({ name: s.string() });

  it("drops keys the shape doesn't name", () => {
    expect(named.parse({ name: "a", extra: 1 })).toEqual({ name: "a" });
  });

  it("reports a missing required key at that key", () => {
    expect(issuesOf(named.safeParse({}))).toEqual([
      { code: "required", path: ["name"], message: 'Missing required key "name"' },
    ]);
  });

  it("refuses lists, null and other non-maps", () => {
    for (const input of [[], null, "x", 1]) {
      expect(issuesOf(named.safeParse(input)).map((issue) => [issue.code, issue.path])).toEqual([
        ["invalid_type", []],
      ]);
    }
  });

  it("returns a new object", () => {
    const input = { name: "a" };
    const value = named.parse(input);
    expect(value).toEqual(input);
    expect(value).not.toBe(input);
  });

  it("ignores keys that only come from the prototype", () => {
    const input = Object.create({ name: "inherited" }) as object;
    expect(issuesOf(named.safeParse(input)).map((issue) => issue.code)).toEqual(["required"]);
  });

  it("reports every key's problems", () => {
    const schema = s.object({ a: s.string(), b: s.number(), c: s.boolean() });
    expect(issuesOf(schema.safeParse({ a: 1, c: true })).map((issue) => issue.path)).toEqual([
      ["a"],
      ["b"],
    ]);
  });
});

describe("schema-kit.object-strict", () => {
  const strict = s.object({ a: s.string() }).strict();

  it("reports unknown keys once, at the object's path", () => {
    expect(issuesOf(strict.safeParse({ a: "x", b: 1, c: 2 }))).toEqual([
      { code: "unknown_keys", path: [], message: 'Unknown keys "b", "c"' },
    ]);
    expect(issuesOf(s.object({ inner: strict }).safeParse({ inner: { a: "x", b: 1 } }))).toEqual([
      { code: "unknown_keys", path: ["inner"], message: 'Unknown key "b"' },
    ]);
  });

  it("still runs the object's refinements", () => {
    const refined = strict.refine(() => false, "no");
    expect(issuesOf(refined.safeParse({ a: "x", b: 1 })).map((issue) => issue.code)).toEqual([
      "unknown_keys",
      "custom",
    ]);
  });
});

describe("schema-kit.object-passthrough", () => {
  it("keeps unknown keys unchecked", () => {
    const frontMatter = s.object({ name: s.string() }).passthrough();
    expect(frontMatter.parse({ name: "a", license: "MIT", tags: [1] })).toEqual({
      name: "a",
      license: "MIT",
      tags: [1],
    });
  });
});

describe("schema-kit.object-extend", () => {
  const target = s.object({ provider: s.string() }).strict();
  const alias = target.extend({ fallback: s.array(s.string()).default([]) });

  it("adds keys", () => {
    expect(alias.parse({ provider: "p" })).toEqual({ provider: "p", fallback: [] });
    expect(Object.keys(alias.shape)).toEqual(["provider", "fallback"]);
  });

  it("keeps the unknown-key mode", () => {
    expect(
      issuesOf(alias.safeParse({ provider: "p", other: 1 })).map((issue) => issue.code),
    ).toEqual(["unknown_keys"]);
  });

  it("replaces a key's schema", () => {
    const replaced = target.extend({ provider: s.number() });
    expect(replaced.parse({ provider: 1 })).toEqual({ provider: 1 });
  });

  it("leaves the original unchanged", () => {
    expect(Object.keys(target.shape)).toEqual(["provider"]);
  });
});

describe("schema-kit.object-partial", () => {
  const comparison = s.object({ gt: s.unknown(), lt: s.unknown() }).partial().strict();

  it("makes every key optional", () => {
    expect(comparison.parse({})).toEqual({});
    expect(comparison.parse({ gt: 1 })).toEqual({ gt: 1 });
  });

  it("keeps checking unknown keys", () => {
    expect(issuesOf(comparison.safeParse({ eq: 1 })).map((issue) => issue.code)).toEqual([
      "unknown_keys",
    ]);
  });

  it("keeps the unknown-key mode it had", () => {
    const strictFirst = s.object({ a: s.string() }).strict().partial();
    expect(strictFirst.unknownKeys).toBe("strict");
  });
});
