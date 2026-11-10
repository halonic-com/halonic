import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { matchName } from "./name-match.ts";

/** The match's rank and the matched text, as the highlight shows it. */
function read(words: string, name: string): string | undefined {
  const match = matchName(words, name);
  return match && `${match.rank}: ${name.slice(match.start, match.end)}`;
}

verifies("shell.palette-groups", () => {
  it("ranks the whole name, then its start, then a word's start, then anywhere", () => {
    expect(read("refund", "Refund")).toBe("exact: Refund");
    expect(read("refund", "Refund checker")).toBe("starts-with: Refund");
    expect(read("refund", "Late refund")).toBe("word-starts-with: refund");
    expect(read("fund", "Refund policy")).toBe("contains: fund");
    expect(read("refnud", "Refund policy")).toBeUndefined();
  });

  it("finds a word's start after an earlier match inside a word", () => {
    expect(read("rep", "Prepare reply")).toBe("word-starts-with: rep");
  });

  it("ignores case and the spaces around the words", () => {
    expect(read("  SUPPORT ", "Support reply")).toBe("starts-with: Support");
    expect(read("zürich", "Office Zürich")).toBe("word-starts-with: Zürich");
  });

  it("keeps the highlight in place when a letter's lower case is longer", () => {
    expect(read("x", "İx")).toBe("contains: x");
  });

  it("matches nothing while nothing is typed", () => {
    expect(matchName("   ", "Home")).toBeUndefined();
  });

  it("reads every character that is special in patterns as itself (plain text is literal)", () => {
    expect(read("workspace.yaml", "workspace.yaml")).toBe("exact: workspace.yaml");
    expect(read("workspace.yaml", "workspaceXyaml")).toBeUndefined();
    expect(read("{ input", "price: { input: 3 }")).toBe("word-starts-with: { input");
    expect(read("(EU)", "Billing (EU)")).toBe("word-starts-with: (EU)");
    expect(read("a*b", "a*b and ab")).toBe("starts-with: a*b");
    expect(read("a*b", "aab")).toBeUndefined();
    for (const special of [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]) {
      expect(read(special, `x ${special}`)).toBe(`word-starts-with: ${special}`);
      expect(read(special, "plain")).toBeUndefined();
    }
  });
});
