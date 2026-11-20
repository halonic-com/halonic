import { describe, expect, it } from "vitest";
import { AllowList } from "./allow.ts";
import { loadAgentNames, MentionMatcher, parseAgentNames } from "./mentions.ts";
import { type Change, scanChanges } from "./scan.ts";
import { TermMatcher } from "./terms.ts";

const matcher = new MentionMatcher(["Julian", "Pip"]);

function textChange(label: string, text: string): Change {
  return { commit: "abc1234", files: [], texts: [{ label, text, termsOnly: false }] };
}

function scan(changes: Change[], mentions: MentionMatcher | undefined) {
  return scanChanges(changes, {
    terms: new TermMatcher([]),
    allowList: new AllowList(""),
    ...(mentions === undefined ? {} : { mentions }),
  });
}

describe("MentionMatcher", () => {
  it("finds an agent's name after an @, in any case, as written", () => {
    expect(matcher.find("Thanks @julian, and @PIP.")).toEqual(["@julian", "@PIP"]);
    expect(matcher.find("(@Julian) **@Pip** @Julian_")).toEqual(["@Julian", "@Pip", "@Julian"]);
  });

  it("leaves the plain name, backticks without @, emails and longer usernames alone", () => {
    expect(
      matcher.find("Julian and `Pip` reviewed; julian@example.com; a@pip; @julian-x; @pipeline"),
    ).toEqual([]);
  });

  it("finds nothing without names", () => {
    expect(new MentionMatcher([]).find("@julian")).toEqual([]);
  });

  it("reads the repo's list, skipping comments and blank lines", () => {
    expect(parseAgentNames("# agents\n\n Julian \nPip\n")).toEqual(["Julian", "Pip"]);
    expect(loadAgentNames()).toEqual(expect.arrayContaining(["Liam", "Julian", "Chief"]));
  });
});

describe("scanChanges with mentions", () => {
  it("fails a commit message, pull request title or body that mentions an agent", () => {
    const findings = scan(
      [
        textChange("commit message", "fix: a typo\n\nReviewed by @Julian"),
        textChange("pull request title", "fix: ask @pip (HAL-1)"),
        textChange("pull request body", "Julian reviews it."),
      ],
      matcher,
    );
    expect(findings.map(({ file, rule }) => `${file} ${rule}`)).toEqual([
      "commit message agent-mention",
      "pull request title agent-mention",
    ]);
    expect(findings[0]?.message).toContain("@Julian");
  });

  it("leaves other texts alone, and everything when no matcher is given", () => {
    expect(scan([textChange("ref name", "@julian")], matcher)).toEqual([]);
    expect(scan([textChange("commit message", "@julian")], undefined)).toEqual([]);
  });
});
