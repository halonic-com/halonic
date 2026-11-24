import { describe, expect, it } from "vitest";
import { AllowList } from "./allow.ts";
import { type Change, scanChanges } from "./scan.ts";
import { excusedTerms, parseTermCutoff } from "./term-cutoffs.ts";
import { TermMatcher } from "./terms.ts";
import { testTerms } from "./test-values.ts";

const now = new Date("2026-11-24T12:00:00Z");
const [older = "", added = ""] = testTerms;

describe("parseTermCutoff", () => {
  it("reads the term's position, the cutoff and the line", () => {
    const cutoff = parseTermCutoff(
      "term-cutoff entry:2 before:2026-11-24T08:00Z added later, history kept",
      7,
      now,
    );
    expect(cutoff).toEqual({ entry: 2, before: new Date("2026-11-24T08:00:00Z"), line: 7 });
  });

  it.each([
    ["no position", "term-cutoff before:2026-11-24T08:00Z added later, history kept"],
    ["position 0", "term-cutoff entry:0 before:2026-11-24T08:00Z added later, history kept"],
    ["a word, not a number", "term-cutoff entry:two before:2026-11-24T08:00Z added later"],
    ["a date without time", "term-cutoff entry:2 before:2026-11-24 added later, history kept"],
    ["a local time", "term-cutoff entry:2 before:2026-11-24T08:00 added later, history kept"],
    ["no reason", "term-cutoff entry:2 before:2026-11-24T08:00Z"],
  ])("refuses an entry with %s", (_case, text) => {
    expect(typeof parseTermCutoff(text, 1, now)).toBe("string");
  });

  it("refuses a cutoff in the future, which would excuse new commits", () => {
    const text = "term-cutoff entry:2 before:2026-11-25T00:00Z added later, history kept";
    expect(parseTermCutoff(text, 1, now)).toContain("future");
  });
});

describe("excusedTerms", () => {
  const cutoffs = [{ entry: 2, before: new Date("2026-11-24T08:00:00Z"), line: 1 }];

  it("excuses a commit committed before the cutoff, by the term's position from 0", () => {
    expect([...excusedTerms(cutoffs, "2026-11-24T07:59:59+00:00")]).toEqual([1]);
    expect([...excusedTerms(cutoffs, "2026-11-24T09:59:59+02:00")]).toEqual([1]);
  });

  it("excuses nothing at or after the cutoff, or without a date", () => {
    expect(excusedTerms(cutoffs, "2026-11-24T08:00:00Z").size).toBe(0);
    expect(excusedTerms(cutoffs, undefined).size).toBe(0);
    expect(excusedTerms(cutoffs, "").size).toBe(0);
  });
});

describe("a term cutoff in the allow file", () => {
  const allowFile = "term-cutoff entry:2 before:2026-11-24T08:00Z added later, history kept";

  function commit(committed: string | undefined, ...lines: string[]): Change {
    return {
      commit: "abc1234",
      ...(committed === undefined ? {} : { committed }),
      files: [
        { path: "docs/a.md", lines: lines.map((text, index) => ({ number: index + 1, text })) },
      ],
      texts: [{ label: "commit message", text: lines.join("\n"), termsOnly: false }],
    };
  }

  function scan(changes: Change[], withCutoffs = true) {
    const allowList = new AllowList(allowFile, now);
    return scanChanges(changes, {
      terms: new TermMatcher(testTerms),
      allowList,
      ...(withCutoffs ? { termCutoffs: allowList.termCutoffs } : {}),
    });
  }

  it("passes the added term in a commit from before the cutoff", () => {
    expect(scan([commit("2026-11-23T10:00:00Z", `by ${added}`)])).toEqual([]);
  });

  it("still fails the added term in a later commit, and an older term in any commit", () => {
    const later = scan([commit("2026-11-24T08:00:00Z", `by ${added}`)]);
    expect(later.map(({ file, rule }) => `${file} ${rule}`)).toEqual([
      "docs/a.md personal-term",
      "commit message personal-term",
    ]);
    expect(scan([commit("2026-11-23T10:00:00Z", `by ${older}`)])).toHaveLength(2);
    expect(scan([commit("2026-11-23T10:00:00Z", `${added} and ${older}`)])).toHaveLength(2);
  });

  it("is ignored where the scan isn't given cutoffs, and for a change without a date", () => {
    expect(scan([commit("2026-11-23T10:00:00Z", `by ${added}`)], false)).toHaveLength(2);
    expect(scan([commit(undefined, `by ${added}`)])).toHaveLength(2);
  });

  it("still withholds the term in an old commit's file name, without a finding", () => {
    const change: Change = {
      commit: "abc1234",
      committed: "2026-11-23T10:00:00Z",
      files: [{ path: `docs/${added.replace(" ", "-")}.md`, lines: [] }],
      texts: [],
    };
    expect(scan([change])).toEqual([]);
  });

  it("fails a second cutoff for the same term and a bad line", () => {
    const list = new AllowList(
      `${allowFile}\nterm-cutoff entry:2 before:2026-11-24T09:00Z a later cutoff\nterm-cutoff entry:x`,
      now,
    );
    expect(list.problems.map((problem) => problem.line)).toEqual([2, 3]);
    expect(list.termCutoffs).toHaveLength(1);
  });
});
