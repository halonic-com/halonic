import { describe, expect, it } from "vitest";
import { formatPath, parse, s } from "./index.ts";

describe("schema-kit.parse-result", () => {
  it("returns the value with defaults filled in", () => {
    const schema = s.object({ name: s.string(), local: s.boolean().default(false) });
    expect(parse(schema, { name: "a" })).toEqual({ ok: true, value: { name: "a", local: false } });
  });

  it("returns every issue instead of throwing", () => {
    const schema = s.object({ name: s.string(), age: s.number() });
    const result = parse(schema, { name: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((issue) => [issue.code, issue.path])).toEqual([
      ["invalid_type", ["name"]],
      ["invalid_type", ["age"]],
    ]);
    for (const issue of result.error) expect(issue.message).not.toBe("");
  });

  it("reports a refinement's own issue with its path", () => {
    const schema = s.object({ steps: s.array(s.string()) }).superRefine((value, context) => {
      if (value.steps.length === 0) {
        context.addIssue({ code: "custom", path: ["steps"], message: "Add a step" });
      }
    });
    const result = parse(schema, { steps: [] });
    expect(result).toEqual({
      ok: false,
      error: [{ code: "custom", path: ["steps"], message: "Add a step" }],
    });
  });
});

describe("schema-kit.issue-path", () => {
  const schema = s.object({ cases: s.array(s.object({ name: s.string() })) });

  it("gives the keys and indexes from the root", () => {
    const result = parse(schema, { cases: [{ name: "a" }, { name: 2 }] });
    expect(result.ok ? [] : result.error.map((issue) => issue.path)).toEqual([
      ["cases", 1, "name"],
    ]);
  });

  it("gives the empty path for the root", () => {
    const result = parse(schema, "text");
    expect(result.ok ? [] : result.error.map((issue) => issue.path)).toEqual([[]]);
  });

  it("formats a path for messages", () => {
    expect(formatPath(["cases", 1, "name"])).toBe("cases[1].name");
    expect(formatPath(["deployments", "prod", "name"])).toBe("deployments.prod.name");
    expect(formatPath([0, "a"])).toBe("[0].a");
    expect(formatPath([])).toBe("");
  });
});
