import { describe, expect, it } from "vitest";
import { AllowList, hasInlineAllow } from "./allow.ts";
import { fingerprint } from "./secrets.ts";

const print = fingerprint("some-value");

describe("AllowList", () => {
  it("allows a secret rule only for the fingerprinted value in the named files", () => {
    const list = new AllowList(`github-token docs/**/*.md ${print} a revoked token in the docs`);
    expect(list.problems).toEqual([]);
    expect(list.allows("github-token", "docs/guides/a.md", print)).toBe(true);
    expect(list.allows("github-token", "docs/guides/a.md", fingerprint("other"))).toBe(false);
    expect(list.allows("github-token", "src/a.ts", print)).toBe(false);
    expect(list.allows("npm-token", "docs/guides/a.md", print)).toBe(false);
  });

  it("allows a path or file rule for a file or glob", () => {
    const list = new AllowList("env-file tooling/*/fixtures/.env tests need a sample env file");
    expect(list.allows("env-file", "tooling/check/fixtures/.env")).toBe(true);
    expect(list.allows("env-file", "tooling/check/deeper/fixtures/.env")).toBe(false);
  });

  it("skips comments and blank lines", () => {
    expect(new AllowList("# a comment\n\n").problems).toEqual([]);
  });

  it("reports each wrong line, and never accepts a personal term", () => {
    const list = new AllowList(
      [
        "personal-term docs/a.md it is fine really",
        "no-such-rule docs/a.md some reason here",
        "github-token docs/a.md no fingerprint given",
        `absolute-path docs/a.md ${print} paths take no fingerprint`,
        "absolute-path docs/a.md",
      ].join("\n"),
    );
    expect(list.problems.map((problem) => problem.line)).toEqual([1, 2, 3, 4, 5]);
    expect(list.allows("personal-term", "docs/a.md")).toBe(false);
  });
});

describe("hasInlineAllow", () => {
  it("needs the absolute-path rule and a reason", () => {
    expect(hasInlineAllow("x # leak-guard: allow absolute-path documents the layout")).toBe(true);
    expect(hasInlineAllow("x # leak-guard: allow absolute-path")).toBe(false);
    expect(hasInlineAllow("x # leak-guard: allow github-token because")).toBe(false);
    expect(hasInlineAllow("x # leak-guard: allow personal-term because")).toBe(false);
  });
});
