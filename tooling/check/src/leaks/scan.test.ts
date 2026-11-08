import { describe, expect, it } from "vitest";
import { AllowList, hasInlineAllow } from "./allow.ts";
import { type Change, scanChanges } from "./scan.ts";
import { fingerprint } from "./secrets.ts";
import { TermMatcher } from "./terms.ts";
import { absolute, fakeSecrets, testTerms } from "./test-values.ts";

const [term = ""] = testTerms;
const token = fakeSecrets["github-token"] ?? "";
const homePath = absolute("home", "someone", "repo");

function fileChange(path: string, ...lines: string[]): Change {
  return {
    commit: undefined,
    files: [{ path, lines: lines.map((text, index) => ({ number: index + 1, text })) }],
    texts: [],
  };
}

function scan(changes: Change[], allowFile = "", terms = testTerms) {
  return scanChanges(changes, {
    terms: new TermMatcher(terms),
    allowList: new AllowList(allowFile),
  });
}

/** Everything a person or a CI log would see. */
function printed(findings: ReturnType<typeof scan>): string {
  return JSON.stringify(findings);
}

describe("scanChanges", () => {
  it("reports file, line and rule for each problem", () => {
    const findings = scan([fileChange("docs/a.md", "fine", `token ${token}`, `at ${homePath}`)]);
    expect(findings.map(({ file, line, rule }) => `${file}:${line} ${rule}`)).toEqual([
      "docs/a.md:2 github-token",
      "docs/a.md:3 absolute-path",
    ]);
  });

  it("never shows a personal term, also not in a file name, commit or identity", () => {
    const findings = scan([
      fileChange(`docs/${term}/notes.md`, `Written by ${term}.`),
      {
        commit: "abc1234",
        files: [],
        texts: [
          { label: "commit message", text: `fix: thanks ${term.toUpperCase()}`, termsOnly: false },
          {
            label: "commit author",
            text: `${term} <${term.toLowerCase()}@example.com>`,
            termsOnly: true,
          },
        ],
      },
    ]);
    expect(findings.map((finding) => finding.rule)).toEqual(Array(4).fill("personal-term"));
    expect(findings[0]?.file).toBe("docs/[withheld]/notes.md");
    expect(printed(findings).toLowerCase()).not.toContain(term.toLowerCase());
  });

  it("withholds the whole path when a two-word term is split across its folders", () => {
    const [first = "", second = ""] = (testTerms[1] ?? "").split(" ");
    const findings = scan([fileChange(`docs/${first}/${second}.md`, `at ${homePath}`)]);
    expect(findings.map(({ file, rule }) => `${file} ${rule}`)).toEqual([
      "[withheld] personal-term",
      "[withheld] absolute-path",
    ]);
    expect(printed(findings).toLowerCase()).not.toContain(second.toLowerCase());
  });

  it("masks secrets and shows only the root of a path", () => {
    const output = printed(scan([fileChange("a.ts", token, homePath)]));
    expect(output).not.toContain(token.slice(4));
    expect(output).not.toContain("someone");
    expect(output).toContain(fingerprint(token));
  });

  it("refuses .env and key files whatever they contain", () => {
    const findings = scan([fileChange("apps/studio/.env.local"), fileChange("release.keystore")]);
    expect(findings.map((finding) => finding.rule)).toEqual(["env-file", "key-file"]);
  });
});

describe("the allow-list", () => {
  it("allows an absolute path with an inline marker and a reason", () => {
    const line = `${homePath} // leak-guard: allow absolute-path explains the Linux layout`;
    expect(hasInlineAllow(line)).toBe(true);
    expect(scan([fileChange("docs/a.md", line)])).toEqual([]);
  });

  it("does not let an inline marker allow a secret or a term", () => {
    const marker = "leak-guard: allow absolute-path just an example";
    const findings = scan([fileChange("a.ts", `${token} ${marker}`, `${term} ${marker}`)]);
    expect(findings.map((finding) => finding.rule)).toEqual(["github-token", "personal-term"]);
  });

  it("allows one secret-shaped value by fingerprint, in the named file only", () => {
    const allowFile = `github-token docs/*.md ${fingerprint(token)} a revoked token in the docs`;
    expect(scan([fileChange("docs/a.md", token)], allowFile)).toEqual([]);
    expect(scan([fileChange("src/a.ts", token)], allowFile)).toHaveLength(1);
    const otherToken = token.replace("ghp_Q", "ghp_R");
    expect(scan([fileChange("docs/a.md", otherToken)], allowFile)).toHaveLength(1);
  });

  it("fails on a bad allow-file entry, and never allows a personal term", () => {
    const allowFile = "personal-term docs/a.md it is fine really";
    const findings = scan([fileChange("docs/a.md", term)], allowFile);
    expect(findings.map(({ rule, line }) => `${rule}:${line ?? ""}`)).toEqual([
      "allow-list:1",
      "personal-term:1",
    ]);
  });
});
