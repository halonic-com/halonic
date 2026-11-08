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

  it("allows a path rule for a file or glob", () => {
    const list = new AllowList("absolute-path docs/*/layout.md explains where an OS keeps files");
    expect(list.allows("absolute-path", "docs/guides/layout.md")).toBe(true);
    expect(list.allows("absolute-path", "docs/guides/deeper/layout.md")).toBe(false);
  });

  it("allows a file rule for one exact file only", () => {
    const list = new AllowList("env-file tooling/check/fixtures/.env tests need a sample env file");
    expect(list.problems).toEqual([]);
    expect(list.allows("env-file", "tooling/check/fixtures/.env")).toBe(true);
    expect(list.allows("env-file", "apps/.env")).toBe(false);
  });

  it("refuses entries broad enough to switch a rule off", () => {
    const list = new AllowList(
      [
        "key-file ** temporary for now",
        "env-file * temporary for now",
        "absolute-path **/* temporary for now",
        "absolute-path */docs/a.md temporary for now",
        "env-file tooling/*/fixtures/.env tests need a sample env file",
      ].join("\n"),
    );
    expect(list.problems.map((problem) => problem.line)).toEqual([1, 2, 3, 4, 5]);
    expect(list.allows("key-file", "deploy/server.pem")).toBe(false);
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
