import { describe, expect, it } from "vitest";
import { loadTerms, normalise, parseTermList, TermMatcher } from "./terms.ts";
import { testTerms } from "./test-values.ts";

// Made-up stand-in terms: the real list never enters the repo.
const [single = "", multiWord = ""] = testTerms;
const matcher = new TermMatcher(testTerms, [`${single}-crossing`]);
const [first = "", second = ""] = multiWord.split(" ");

describe("TermMatcher", () => {
  it("matches in any case", () => {
    expect(matcher.matches(`A ${single.toUpperCase()} walked by`)).toBe(true);
    expect(matcher.matches(`a ${single.toLowerCase()} walked by`)).toBe(true);
  });

  it("matches inside longer words and identifiers", () => {
    expect(matcher.matches(`${single}s`)).toBe(true);
    expect(matcher.matches(`const load${single}Data = 1;`)).toBe(true);
    expect(matcher.matches(`pre_${single.toLowerCase()}_post`)).toBe(true);
  });

  it("sees through look-alike spellings", () => {
    const [first = "", second = ""] = multiWord.split(" ");
    const withEscape = `${first}%20${second}`;
    const fullWidth = single.replace(/[a-z]/gi, (letter) =>
      String.fromCodePoint(letter.toLowerCase().charCodeAt(0) + 0xfee0),
    );
    const withInvisibleCharacter = `${single.slice(0, 2)}\u200b${single.slice(2)}`;
    for (const disguised of [withEscape, fullWidth, withInvisibleCharacter]) {
      expect(matcher.matches(disguised)).toBe(true);
    }
  });

  it("matches a multi-word term with any separator or none", () => {
    for (const joined of [`${first}.${second}`, `${first}_${second}`, `${first}${second}`]) {
      expect(matcher.matches(joined.toLowerCase()), "joined form").toBe(true);
    }
    expect(matcher.matches(`${first}, and later ${second}`)).toBe(false);
  });

  it("ignores the allowed technical phrases, but never the bare term", () => {
    expect(matcher.matches(`draw a ${single}-crossing`)).toBe(false);
    expect(matcher.matches(`a ${single}-crossing and a ${single}`)).toBe(true);
    const abused = new TermMatcher(testTerms, [single.toUpperCase(), ` ${single}.`]);
    expect(abused.matches(single)).toBe(true);
  });

  it("ignores a term only where it lies inside an allowed phrase", () => {
    const shortPhrase = new TermMatcher(testTerms, [single.slice(1, 3)]);
    expect(shortPhrase.matches(single)).toBe(true);
    const partPhrase = new TermMatcher(testTerms, [`${single.slice(0, -2)} tail`]);
    expect(partPhrase.matches(`${single.slice(0, -2)} tail and ${single}`)).toBe(true);
    const longer = new TermMatcher(testTerms, [`x${single}-crossing`]);
    expect(longer.matches(`${single}-crossing`)).toBe(true);
  });

  it("withholds the parts of a path that contain a term", () => {
    expect(matcher.redactPath(`docs/${single}-notes/plan.md`)).toBe("docs/[withheld]/plan.md");
    expect(matcher.redactPath("docs/plan.md")).toBe("docs/plan.md");
  });

  it("withholds the whole path when a term is split across folders", () => {
    expect(matcher.redactPath(`docs/${first}/${second}.md`)).toBe("[withheld]");
    expect(matcher.redactPath(`docs/${first}/notes.md`)).toBe(`docs/${first}/notes.md`);
  });

  it("counts the loaded terms", () => {
    expect(matcher.size).toBe(2);
  });

  it("is empty when no terms are configured", () => {
    expect(new TermMatcher([]).isEmpty).toBe(true);
    expect(new TermMatcher(["  ", "--"]).isEmpty).toBe(true);
  });
});

describe("normalise", () => {
  it("decodes percent escapes, and replaces broken ones with a space", () => {
    expect(normalise("a%20b")).toBe("a b");
    expect(normalise("a%E0%A4b")).toBe("a b");
  });
});

describe("parseTermList", () => {
  it("reads one term per line, trims, and skips blank lines and comments", () => {
    expect(parseTermList("zebra, okapi\r\n# note\n\n  blue whale  \n")).toEqual([
      "zebra",
      "okapi",
      "blue whale",
    ]);
  });
});

describe("loadTerms", () => {
  it("prefers the CI secret, then the file named by the environment", () => {
    expect(loadTerms({ HALONIC_DENY_TERMS: "a\nb" })).toEqual({
      terms: ["a", "b"],
      source: "secret",
    });
    expect(loadTerms({ HALONIC_DENY_TERMS_FILE: "missing-file" })).toEqual({
      terms: [],
      source: "none",
    });
  });

  it("treats a secret with only comments and blank lines as not set", () => {
    const environment = {
      HALONIC_DENY_TERMS: "# nothing here\n\n  \n",
      HALONIC_DENY_TERMS_FILE: "missing-file",
    };
    expect(loadTerms(environment)).toEqual({ terms: [], source: "none" });
  });
});
