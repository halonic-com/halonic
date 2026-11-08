import { describe, expect, it } from "vitest";
import { formatPath, type Issue, SchemaError, s } from "./index.ts";

function issuesOf(result: { ok: boolean; error?: Issue[] }): Issue[] {
  return result.ok ? [] : (result.error ?? []);
}

function pathsOf(result: { ok: boolean; error?: Issue[] }): unknown[] {
  return issuesOf(result).map((issue) => issue.path);
}

describe("schema-kit.parse-result", () => {
  const person = s.object({ name: s.string(), age: s.number() });

  it("returns the value from parse and safeParse when the input matches", () => {
    expect(s.string().parse("hi")).toBe("hi");
    expect(s.string().safeParse("hi")).toEqual({ ok: true, value: "hi" });
  });

  it("returns every issue from safeParse without throwing", () => {
    const result = person.safeParse({ name: 1 });
    expect(result.ok).toBe(false);
    expect(pathsOf(result)).toEqual([["name"], ["age"]]);
  });

  it("throws a SchemaError with every issue and one message line per issue", () => {
    let thrown: unknown;
    try {
      person.parse({ name: 1 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SchemaError);
    const error = thrown as SchemaError;
    expect(error.issues).toHaveLength(2);
    expect(error.message).toBe(
      'name: Expected text, got a number\nage: Missing required key "age"',
    );
  });

  it("names the root (root) in messages", () => {
    expect(() => s.string().parse(1)).toThrow("(root): Expected text, got a number");
  });
});

describe("schema-kit.issue-path", () => {
  const tests = s.object({ cases: s.array(s.object({ name: s.string() })) });

  it("gives the path of keys and indexes down to the value", () => {
    const result = tests.safeParse({ cases: [{ name: "a" }, { name: 2 }] });
    expect(pathsOf(result)).toEqual([["cases", 1, "name"]]);
  });

  it("gives the empty path for a problem at the root", () => {
    expect(pathsOf(tests.safeParse("x"))).toEqual([[]]);
  });

  it("formats a path for messages", () => {
    expect(formatPath(["cases", 1, "name"])).toBe("cases[1].name");
    expect(formatPath([0, "a"])).toBe("[0].a");
    expect(formatPath([])).toBe("");
  });
});

describe("schema-kit.optional", () => {
  it("leaves a missing key out of the parsed object", () => {
    const value = s.object({ model: s.string().optional() }).parse({});
    expect(value).toEqual({});
    expect(Object.hasOwn(value, "model")).toBe(false);
  });

  it("keeps a key that is there with undefined", () => {
    const value = s.object({ model: s.string().optional() }).parse({ model: undefined });
    expect(Object.hasOwn(value, "model")).toBe(true);
  });

  it("still refuses null", () => {
    expect(issuesOf(s.string().optional().safeParse(null)).map((issue) => issue.code)).toEqual([
      "invalid_type",
    ]);
  });

  it("skips the refinements of a missing optional key", () => {
    const schema = s.object({
      a: s
        .string()
        .optional()
        .refine(() => false, "never"),
    });
    expect(schema.safeParse({}).ok).toBe(true);
  });
});

describe("schema-kit.default", () => {
  it("fills in a missing key or undefined", () => {
    const schema = s.object({ local: s.boolean().default(false) });
    expect(schema.parse({})).toEqual({ local: false });
    expect(schema.parse({ local: undefined })).toEqual({ local: false });
    expect(schema.parse({ local: true })).toEqual({ local: true });
  });

  it("gives every parse its own copy of a list or map", () => {
    const tags = s.array(s.string()).default([]);
    const first = tags.parse(undefined);
    first.push("changed");
    expect(tags.parse(undefined)).toEqual([]);
    const options = s.record(s.string(), s.unknown()).default({});
    const firstOptions = options.parse(undefined);
    firstOptions["changed"] = true;
    expect(options.parse(undefined)).toEqual({});
  });

  it("doesn't check the default value", () => {
    expect(s.number().min(10).default(3).parse(undefined)).toBe(3);
  });

  it("still fills in the default under .optional()", () => {
    const schema = s.object({ retries: s.number().default(3).optional() });
    expect(schema.parse({})).toEqual({ retries: 3 });
  });

  it("leaves the key out under .optional() when a refinement rejects the default", () => {
    const schema = s.object({
      retries: s
        .number()
        .default(3)
        .refine((value) => value > 5, "too few")
        .optional(),
    });
    expect(schema.parse({})).toEqual({});
  });

  it("reports a refinement that rejects the default of a required key", () => {
    const schema = s.object({
      retries: s
        .number()
        .default(3)
        .refine((value) => value > 5, "too few"),
    });
    expect(pathsOf(schema.safeParse({}))).toEqual([["retries"]]);
  });
});

describe("schema-kit.refine", () => {
  it("reports a custom issue at the refined value's path", () => {
    const deployments = s.object({
      deployments: s
        .record(s.string(), s.number())
        .refine((map) => Object.keys(map).length > 0, "Name at least one"),
    });
    expect(issuesOf(deployments.safeParse({ deployments: {} }))).toEqual([
      { code: "custom", path: ["deployments"], message: "Name at least one" },
    ]);
  });

  it("lets refineWith report several issues with relative paths", () => {
    const field = s
      .object({
        type: s.string(),
        values: s.array(s.string()).optional(),
        collection: s.string().optional(),
      })
      .refineWith((value, report) => {
        if (value.type === "choice" && !value.values?.length)
          report("A choice field needs values", ["values"]);
        if (value.type === "ref" && !value.collection) report("A ref field needs a collection");
      });
    const fields = s.record(s.string(), field);
    expect(issuesOf(fields.safeParse({ kind: { type: "choice" } }))).toEqual([
      { code: "custom", path: ["kind", "values"], message: "A choice field needs values" },
    ]);
    expect(pathsOf(fields.safeParse({ owner: { type: "ref" } }))).toEqual([["owner"]]);
  });

  it("is skipped when the value has no usable shape", () => {
    const schema = s.object({ a: s.string() }).refine(() => false, "no");
    expect(issuesOf(schema.safeParse({ a: 1 })).map((issue) => issue.code)).toEqual([
      "invalid_type",
    ]);
  });

  it("still runs after checks that leave the shape usable", () => {
    const schema = s
      .string()
      .min(2)
      .refine(() => false, "no");
    expect(issuesOf(schema.safeParse("x")).map((issue) => issue.code)).toEqual([
      "too_small",
      "custom",
    ]);
  });

  it("runs every refinement in order", () => {
    const schema = s
      .string()
      .refine((value) => value.length > 1, "first")
      .refine((value) => value.startsWith("a"), "second");
    expect(issuesOf(schema.safeParse("b")).map((issue) => issue.message)).toEqual([
      "first",
      "second",
    ]);
  });
});
