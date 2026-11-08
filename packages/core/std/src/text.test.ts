import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { slugify, uniqueName } from "./text.ts";

verifies("std.slugify", () => {
  it.each([
    ["Weekly Report", "weekly-report"],
    ["  Inbox   triage  ", "inbox-triage"],
    ["Café crème!", "cafe-creme"],
    ["snake_case name", "snake-case-name"],
    ["a -- b", "a-b"],
    ["Q3 2026 / Plan", "q3-2026-plan"],
    ["Ünïcödé", "unicode"],
    ["_a_", "a"],
    ["-draft-", "draft"],
    ["--rf", "rf"],
  ])("turns %j into %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("falls back to 'item' when nothing usable is left", () => {
    expect(slugify("")).toBe("item");
    expect(slugify("!!!")).toBe("item");
    expect(slugify("日本語")).toBe("item");
    expect(slugify("___")).toBe("item");
    expect(slugify("!!! - !!!")).toBe("item");
  });
});

verifies("std.unique-name", () => {
  it("keeps the base when it is free", () => {
    expect(uniqueName("report", ["inbox"])).toBe("report");
  });

  it("adds the first free number from 2", () => {
    expect(uniqueName("report", ["report"])).toBe("report-2");
    expect(uniqueName("report", ["report", "report-2", "report-4"])).toBe("report-3");
  });

  it("accepts any iterable of taken names, such as a set or map keys", () => {
    expect(uniqueName("a", new Set(["a"]))).toBe("a-2");
    expect(uniqueName("a", new Map([["a", 1]]).keys())).toBe("a-2");
  });
});
