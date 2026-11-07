import { describe, expect, it } from "vitest";
import { parseTermList, TermMatcher, words } from "./terms.ts";

// Neutral stand-in terms: the real list never enters the repo.
const matcher = new TermMatcher(["zebra", "blue whale"], ["zebra-crossing"]);

describe("words", () => {
  it("splits identifiers into lowercase words", () => {
    expect(words("someZebraHelper some_zebra HTTPServer")).toEqual([
      "some",
      "zebra",
      "helper",
      "some",
      "zebra",
      "http",
      "server",
    ]);
  });
});

describe("TermMatcher", () => {
  it("matches whole words case-insensitively", () => {
    expect(matcher.matches("A ZEBRA walked by")).toBe(true);
  });

  it("matches inside camelCase and snake_case identifiers", () => {
    expect(matcher.matches("const loadZebraData = 1;")).toBe(true);
    expect(matcher.matches("load_zebra_data")).toBe(true);
  });

  it("matches multi-word terms only when the words are in a row", () => {
    expect(matcher.matches("theBlueWhaleSong")).toBe(true);
    expect(matcher.matches("blue sky, whale song")).toBe(false);
  });

  it("does not match a term that is only part of a longer word", () => {
    expect(matcher.matches("zebras")).toBe(false);
  });

  it("ignores the allowed technical phrases", () => {
    expect(matcher.matches("draw a zebra-crossing")).toBe(false);
    expect(matcher.matches("zebra-crossing and a zebra")).toBe(true);
  });

  it("reports matching line numbers, not the term", () => {
    expect(matcher.matchingLines("fine\nzebra here\nfine")).toEqual([2]);
  });

  it("withholds the parts of a path that contain a term", () => {
    expect(matcher.redactPath("docs/zebra-notes/plan.md")).toBe("docs/[withheld]/plan.md");
    expect(matcher.redactPath("docs/plan.md")).toBe("docs/plan.md");
  });

  it("is empty when no terms are configured", () => {
    expect(new TermMatcher([]).isEmpty).toBe(true);
  });
});

describe("parseTermList", () => {
  it("reads one term per line or comma-separated, skipping comments", () => {
    expect(parseTermList("zebra, okapi\n# note\n blue whale \n")).toEqual([
      "zebra",
      "okapi",
      "blue whale",
    ]);
  });
});
