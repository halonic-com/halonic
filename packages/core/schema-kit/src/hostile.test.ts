import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Issue, parse, type Schema, s } from "./index.ts";
import { fileSchemas, Guard } from "./test/old-schemas.kit.ts";

const seed = Number(process.env["SCHEMA_KIT_SEED"] ?? 20261107);

function issuesOf(result: { ok: true } | { ok: false; error: Issue[] }): [string, unknown][] {
  return result.ok ? [] : result.error.map((issue) => [issue.code, issue.path]);
}

function nestedNot(depth: number): unknown {
  let guard: unknown = { exists: "input.x" };
  for (let level = 0; level < depth; level++) guard = { not: guard };
  return guard;
}

describe("schema-kit.parse-result", () => {
  describe("hostile input", () => {
    it("never throws on any generated value", () => {
      const schemas: Schema[] = [Guard, ...Object.values(fileSchemas)];
      fc.assert(
        fc.property(
          fc.anything({ withNullPrototype: true, withObjectString: true, withSparseArray: true }),
          (value) => {
            for (const schema of schemas) expect(() => parse(schema, value)).not.toThrow();
          },
        ),
        { seed, numRuns: 300 },
      );
    });

    it("handles a list of a hundred thousand items", () => {
      const list = Array.from({ length: 100_000 }, (_, index) => (index % 2 === 0 ? "a" : 1));
      const result = parse(s.array(s.string()), list);
      expect(result.ok ? 0 : result.error.length).toBe(50_000);
    });
  });
});

describe("schema-kit.nesting-limit", () => {
  it("accepts the old guards nested 200 levels", () => {
    expect(parse(Guard, nestedNot(200)).ok).toBe(true);
  });

  it("fails a guard nested 100,000 levels cleanly", () => {
    const result = parse(Guard, nestedNot(100_000));
    expect(result.ok ? [] : result.error.map((issue) => issue.code)).toEqual(["too_deep"]);
  });
});

describe("schema-kit.prototype-keys", () => {
  const hostile = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}') as unknown;

  it("drops __proto__ from records and keeps the plain prototype", () => {
    const result = parse(s.record(s.string(), s.unknown()), hostile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value)).toEqual(["a"]);
    expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("drops __proto__ from passthrough objects and intersections", () => {
    const loose = parse(s.object({ a: s.number() }).passthrough(), hostile);
    expect(loose.ok && Object.keys(loose.value)).toEqual(["a"]);
    expect(loose.ok && Object.getPrototypeOf(loose.value)).toBe(Object.prototype);
    const merged = parse(
      s.intersection(s.record(s.string(), s.unknown()), s.object({ a: s.number() })),
      hostile,
    );
    expect(merged.ok && Object.keys(merged.value)).toEqual(["a"]);
  });

  it("reports __proto__ as an unknown key of a strict object", () => {
    const result = parse(s.object({ a: s.number() }).strict(), hostile);
    expect(issuesOf(result)).toEqual([["unrecognized_keys", []]]);
    expect(result.ok ? [] : result.error[0]?.keys).toEqual(["__proto__"]);
  });
});
