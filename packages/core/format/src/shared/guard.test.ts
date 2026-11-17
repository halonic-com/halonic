import { describe, expect, it } from "vitest";
import { isGuard } from "./guard.ts";

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
