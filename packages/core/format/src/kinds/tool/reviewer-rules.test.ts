import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, yaml } from "../../test/parse.spec.ts";

/** A `pr_status` tool reading `acme/website`, with these lines under `reviewerRules`. */
function prStatus(...rules: string[]): string {
  return yaml(
    "id: pr-status",
    "name: pr_status",
    "description: Reads one pull request.",
    "parameters:",
    "  pr: { type: integer, description: The number., required: true }",
    "callers: everyone",
    "action:",
    "  run: github.pull-request",
    "  with:",
    "    repositories: [acme/website]",
    "    reviewerRules:",
    ...rules.map((line) => `      ${line}`),
  );
}

/** Rules for one repository, with these lines added to its block. */
function rulesFor(repo: string, ...lines: string[]): string[] {
  return [
    `${repo}:`,
    "  default: second-reviewer",
    "  escalateTo: code-reviewer",
    ...lines.map((line) => `  ${line}`),
  ];
}

/** The problems' paths and codes, without lines: the schema's codes say enough here. */
function pathsOf(text: string): string[] {
  return problemsOf("tool", text).map((problem) => problem.path.join("."));
}

verifies("format.tool-reviewer-rules", () => {
  it("accepts roles, paths, words and regexes, and fills in the defaults", () => {
    const tool = parsedValue(
      "tool",
      prStatus(
        ...rulesFor(
          "acme/website",
          "files: [pnpm-lock.yaml]",
          "wordsSkip: ['(^|/)(test|tests)/']",
          "lineLimit: { max: 1200, skip: ['\\.md$'] }",
        ),
      ),
    );
    expect(tool.action.with).toMatchObject({
      reviewerRules: {
        "acme/website": {
          default: "second-reviewer",
          escalateTo: "code-reviewer",
          files: ["pnpm-lock.yaml"],
          folders: [],
          words: [],
          wordsSkip: ["(^|/)(test|tests)/"],
          lineLimit: { max: 1200, skip: ["\\.md$"] },
          nestedPackageJson: false,
        },
      },
    });
  });

  it("refuses a person where a role goes", () => {
    const text = prStatus("acme/website:", "  default: second-reviewer", "  escalateTo: liam");
    expect(pathsOf(text)).toEqual(["action.with.reviewerRules.acme/website.escalateTo"]);
  });

  it("refuses a regex that doesn't compile, at that regex", () => {
    const text = prStatus(...rulesFor("acme/website", "wordsSkip: ['(unclosed']"));
    expect(pathsOf(text)).toEqual(["action.with.reviewerRules.acme/website.wordsSkip.0"]);
  });

  it("refuses rules for a repository the tool doesn't read", () => {
    const problems = problemsOf("tool", prStatus(...rulesFor("acme/other")));
    expect(problems.map((problem) => problem.message).join(" ")).toContain(
      "give reviewer rules only for repositories in the list",
    );
  });

  it("refuses a key it doesn't know", () => {
    const text = prStatus(...rulesFor("acme/website", "reviewer: liam"));
    expect(problemsOf("tool", text)).not.toEqual([]);
  });
});
