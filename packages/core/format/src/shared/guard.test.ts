import { describe, expect, it } from "vitest";
import { guardProblem, isGuard } from "./guard.ts";

describe("isGuard", () => {
  it("accepts every shape of condition, nested ones too", () => {
    expect(isGuard({ exists: "mail.id" })).toBe(true);
    expect(isGuard({ equals: ["{{a}}", 1] })).toBe(true);
    expect(isGuard({ all: [{ exists: "a" }, { not: { gt: [1, 2] } }] })).toBe(true);
  });

  it("refuses objects that are no condition", () => {
    expect(isGuard({})).toBe(false);
    expect(isGuard({ foo: 1 })).toBe(false);
    expect(isGuard({ exists: 5 })).toBe(false);
    expect(isGuard({ all: [{ foo: 1 }] })).toBe(false);
    expect(isGuard({ exists: "a", extra: true })).toBe(false);
  });

  it("refuses values that are no object", () => {
    expect(isGuard(null)).toBe(false);
    expect(isGuard("exists")).toBe(false);
    expect(isGuard([{ exists: "a" }])).toBe(false);
  });
});

describe("guardProblem", () => {
  it("names an unknown kind and lists the allowed ones", () => {
    expect(guardProblem({ matches: ["a", "b"] })).toBe(
      'unknown condition kind "matches"; allowed: equals, notEquals, contains, exists, gt, gte, lt, lte, not, all, any',
    );
  });

  it("says what a known kind takes", () => {
    expect(guardProblem({ exists: 5 })).toBe(
      'condition "exists" takes a path, such as input.email',
    );
    expect(guardProblem({ all: { exists: "a" } })).toBe(
      'condition "all" takes a list of conditions',
    );
  });

  it("asks for exactly one kind when there are none, several, or no map", () => {
    for (const input of [{}, { exists: "a", extra: true }, "exists", null, [{ exists: "a" }]]) {
      expect(guardProblem(input)).toMatch(/^a condition is a map with exactly one kind/);
    }
  });
});
