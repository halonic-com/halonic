import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Issue, MAX_DEPTH, type Schema, s } from "./index.ts";
import { Guard as GuardSchema } from "./test/old-schemas.kit.ts";

const seed = Number(process.env["SCHEMA_KIT_SEED"] ?? 20261107);

function issuesOf(result: { ok: boolean; error?: Issue[] }): [string, unknown][] {
  const issues = result.ok ? [] : (result.error ?? []);
  return issues.map((issue) => [issue.code, issue.path]);
}

function nestedNot(depth: number): unknown {
  let guard: unknown = { exists: "input.x" };
  for (let level = 0; level < depth; level++) guard = { not: guard };
  return guard;
}

describe("schema-kit.recursive", () => {
  it("checks a value with the schema the getter returns", () => {
    expect(
      GuardSchema.safeParse({ all: [{ not: { exists: "input.x" } }, { gt: ["{{a}}", 1] }] }).ok,
    ).toBe(true);
  });

  it("reports at the outermost union when no option matches", () => {
    expect(issuesOf(GuardSchema.safeParse({ all: [{ not: { exists: 1 } }] }))).toEqual([
      ["no_union_match", []],
    ]);
  });

  it("calls the getter once", () => {
    let calls = 0;
    type Tree = { children: Tree[] };
    const tree: Schema<Tree> = s.lazy(() => {
      calls++;
      return s.object({ children: s.array(tree) });
    });
    tree.parse({ children: [{ children: [] }, { children: [{ children: [] }] }] });
    tree.parse({ children: [] });
    expect(calls).toBe(1);
  });
});

describe("schema-kit.nesting-limit", () => {
  it("accepts guards nested 200 levels", () => {
    expect(GuardSchema.safeParse(nestedNot(200)).ok).toBe(true);
  });

  it("reports too_deep instead of overflowing the stack", () => {
    type Tree = { child?: Tree | undefined };
    const tree: Schema<Tree> = s.lazy(() => s.object({ child: tree.optional() }));
    let value: Tree = {};
    for (let level = 0; level < 100_000; level++) value = { child: value };
    const result = tree.safeParse(value);
    expect(result.ok ? [] : result.error.map((issue) => issue.code)).toEqual(["too_deep"]);
  });

  it("fails a guard nested 100,000 levels cleanly", () => {
    expect(issuesOf(GuardSchema.safeParse(nestedNot(100_000)))).toEqual([["no_union_match", []]]);
  });

  it("reports too_deep at the path where the limit is passed", () => {
    type Tree = { child?: Tree | undefined };
    const tree: Schema<Tree> = s.lazy(() => s.object({ child: tree.optional() }));
    let value: Tree = {};
    for (let level = 0; level <= MAX_DEPTH; level++) value = { child: value };
    const result = tree.safeParse(value);
    const issue = result.ok ? undefined : result.error[0];
    expect(issue?.code).toBe("too_deep");
    expect(issue?.path).toHaveLength(MAX_DEPTH + 1);
  });

  it("stops on a value that contains itself", () => {
    type Tree = { child?: Tree | undefined };
    const tree: Schema<Tree> = s.lazy(() => s.object({ child: tree.optional() }));
    const loop: Tree = {};
    loop.child = loop;
    expect(tree.safeParse(loop).ok).toBe(false);
  });
});

describe("schema-kit.prototype-keys", () => {
  const hostile = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}') as unknown;

  it("drops __proto__ from records and keeps the plain prototype", () => {
    const value = s.record(s.string(), s.unknown()).parse(hostile);
    expect(Object.keys(value)).toEqual(["a"]);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("drops __proto__ from passthrough objects and intersections", () => {
    const loose = s.object({ a: s.number() }).passthrough().parse(hostile);
    expect(Object.keys(loose)).toEqual(["a"]);
    expect(Object.getPrototypeOf(loose)).toBe(Object.prototype);
    const merged = s
      .intersection(s.object({}).passthrough(), s.object({ a: s.number() }).passthrough())
      .parse(hostile);
    expect(Object.keys(merged)).toEqual(["a"]);
  });

  it("reports __proto__ as an unknown key of a strict object", () => {
    expect(issuesOf(s.object({ a: s.number() }).strict().safeParse(hostile))).toEqual([
      ["unknown_keys", []],
    ]);
  });
});

describe("schema-kit.parse-result", () => {
  describe("hostile input", () => {
    it("never throws on any generated value", () => {
      const schemas = [
        GuardSchema,
        s.record(s.string().min(1), s.array(s.union([s.string(), s.number()]))),
      ];
      fc.assert(
        fc.property(
          fc.anything({ withNullPrototype: true, withObjectString: true, withSparseArray: true }),
          (value) => {
            for (const schema of schemas) expect(() => schema.safeParse(value)).not.toThrow();
          },
        ),
        { seed, numRuns: 1000 },
      );
    });

    it("handles a list of a hundred thousand items", () => {
      const list = Array.from({ length: 100_000 }, (_, index) => (index % 2 === 0 ? "a" : 1));
      const result = s.array(s.string()).safeParse(list);
      expect(result.ok ? 0 : result.error.length).toBe(50_000);
    });
  });
});
