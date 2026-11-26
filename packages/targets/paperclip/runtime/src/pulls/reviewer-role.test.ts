import type { RepositoryReviewerRules, Routing } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { GitHubGet } from "../github.ts";
import {
  type ChangedFiles,
  changedFiles,
  defaultReviewerNote,
  noteDefaultReviewer,
  reviewerByPaths,
  reviewerText,
  reviewRoleByPaths,
} from "./reviewer-role.ts";

/**
 * Rules shaped like the ones Liam asked for on HAL-18289, written for the
 * invented `acme/website`: exact files, folders, words with the same skip
 * regexes as `isTestPath` / `isWordsOnly`, a 1200-line limit with 800 in
 * `src/kernel/`, and any nested `package.json`.
 */
const testPath = [
  "\\.(test|spec)\\.[cm]?[jt]sx?$",
  "(^|\\/)(test|tests|fixtures|golden|__snapshots__)\\/",
];
const rules: RepositoryReviewerRules = {
  default: "second-reviewer",
  escalateTo: "code-reviewer",
  files: ["pnpm-lock.yaml", "package.json"],
  folders: ["infra/", ".github/"],
  words: ["sandbox", "secret", "sign-in"],
  wordsSkip: [...testPath, "\\.md$", "^apps\\/cli\\/src\\/messages\\/", "(^|[/-])words\\.[jt]sx?$"],
  lineLimit: {
    max: 1200,
    skip: [...testPath, "\\.md$"],
    folderLimits: [{ folders: ["src/kernel/"], max: 800 }],
  },
  nestedPackageJson: true,
};

/** Changed files without their own line counts. */
function filesAt(paths: readonly string[]): ChangedFiles {
  return { paths, lines: {} };
}

const routing: Routing = {
  roles: { "second-reviewer": "mateo", "code-reviewer": "priya" },
  areas: {},
};

verifies("runtime.github-reviewer-rules", () => {
  describe("the role by paths", () => {
    test.each([
      ["a plain code change", ["src/cart.ts"], 150, "second-reviewer"],
      ["an exact file", ["pnpm-lock.yaml"], 3, "code-reviewer"],
      ["a folder prefix", ["infra/deploy.ts"], 3, "code-reviewer"],
      ["a word in a code path, in any case", ["src/SandBox/run.ts"], 3, "code-reviewer"],
      ["a word only in a test", ["src/sandbox/run.test.ts"], 3, "second-reviewer"],
      ["a word only in a fixture folder", ["src/fixtures/secret.json"], 3, "second-reviewer"],
      ["a word only in Markdown", ["docs/secret-handling.md"], 3, "second-reviewer"],
      [
        "a word only in the CLI's messages",
        ["apps/cli/src/messages/sign-in.ts"],
        3,
        "second-reviewer",
      ],
      ["a word only in a wording file", ["src/sign-in-words.ts"], 3, "second-reviewer"],
      ["a nested package.json", ["packages/cart/package.json"], 2, "code-reviewer"],
      ["over the line limit", ["src/cart.ts"], 1201, "code-reviewer"],
      [
        "over the limit, only tests and Markdown",
        ["src/cart.test.ts", "README.md"],
        5000,
        "second-reviewer",
      ],
      ["at the limit", ["src/cart.ts"], 1200, "second-reviewer"],
      ["over a folder limit", ["src/kernel/step.ts"], 801, "code-reviewer"],
      ["at a folder limit", ["src/kernel/step.ts"], 800, "second-reviewer"],
    ] as const)("%s", (_, paths, lines, role) => {
      expect(reviewRoleByPaths(rules, paths, lines)).toBe(role);
    });

    describe("with each file's changed lines", () => {
      test.each([
        [
          "lines in skipped files don't count toward the limit",
          { "src/cart.ts": 700, "src/cart.test.ts": 900 },
          "second-reviewer",
        ],
        [
          "code lines in all folders add up",
          { "src/cart.ts": 700, "src/kernel/step.ts": 501 },
          "code-reviewer",
        ],
        [
          "a folder limit counts only its folders",
          { "src/cart.ts": 1000, "src/kernel/step.ts": 100 },
          "second-reviewer",
        ],
        [
          "over a folder limit",
          { "src/kernel/step.ts": 500, "src/kernel/run.ts": 301 },
          "code-reviewer",
        ],
        [
          "tests in the folder don't count toward its limit",
          { "src/kernel/step.ts": 400, "src/kernel/step.test.ts": 900 },
          "second-reviewer",
        ],
      ] as const)("%s", (_, lines, role) => {
        const paths = Object.keys(lines);
        const total = Object.values(lines).reduce((sum, count) => sum + count, 0);
        expect(reviewRoleByPaths(rules, paths, total, lines)).toBe(role);
      });

      test("a path without its count falls back to the whole pull request's lines", () => {
        const paths = ["src/kernel/step.ts", "src/kernel/run.ts"];
        expect(reviewRoleByPaths(rules, paths, 900, { "src/kernel/step.ts": 10 })).toBe(
          "code-reviewer",
        );
      });
    });

    describe("with a narrower role", () => {
      const narrowed: RepositoryReviewerRules = {
        ...rules,
        narrowTo: {
          role: "routine-reviewer",
          folders: ["src/kernel/"],
          patterns: ["(^|\\/)src\\/index\\.[cm]?tsx?$"],
        },
      };

      test.each([
        ["a plain code change narrows", ["src/cart.ts"], 150, "routine-reviewer"],
        [
          "a path under its folders stays with default",
          ["src/kernel/step.ts"],
          3,
          "second-reviewer",
        ],
        ["a path matching its patterns stays with default", ["src/index.ts"], 3, "second-reviewer"],
        [
          "one such path keeps the whole pull request",
          ["src/cart.ts", "src/index.ts"],
          3,
          "second-reviewer",
        ],
        ["an escalating path still escalates", ["infra/deploy.ts"], 3, "code-reviewer"],
        ["over the line limit still escalates", ["src/cart.ts"], 1201, "code-reviewer"],
      ] as const)("%s", (_, paths, lines, role) => {
        expect(reviewRoleByPaths(narrowed, paths, lines)).toBe(role);
      });

      test("notes the narrower reviewer's approval too", () => {
        const routineRouting: Routing = {
          ...routing,
          roles: { ...routing.roles, "routine-reviewer": "nora" },
        };
        const reviewer = reviewerByPaths(narrowed, filesAt(["src/cart.ts"]), 3, routineRouting);
        expect(reviewer).toEqual({ role: "routine-reviewer", person: "nora" });
        const nora = { by: "Nora", head: "7651f8c", counts: true };
        expect(noteDefaultReviewer([nora], narrowed, reviewer, () => true)).toEqual([
          { ...nora, note: defaultReviewerNote },
        ]);
      });
    });

    test("only the rules a repository gives fire: no line limit means none", () => {
      const { lineLimit: _, ...noLimit } = rules;
      expect(reviewRoleByPaths(noLimit, ["src/cart.ts"], 99_999)).toBe("second-reviewer");
    });
  });

  describe("the person and the answer", () => {
    test("names who the routing gives the role, and says it is by paths only", () => {
      const reviewer = reviewerByPaths(rules, filesAt(["infra/deploy.ts"]), 3, routing);
      expect(reviewer).toEqual({ role: "code-reviewer", person: "priya" });
      expect(reviewerText(reviewer)).toBe(
        "reviewer: priya as code-reviewer (by paths; security/release PRs, the author's own PRs and PRs not written by the team route differently)",
      );
    });

    test("names the role alone when no one covers it, and says when there are no rules", () => {
      const reviewer = reviewerByPaths(rules, filesAt(["src/cart.ts"]), 3, undefined);
      expect(reviewerText(reviewer)).toBe(
        "reviewer: second-reviewer, no one covers it in the routing (by paths; security/release PRs, the author's own PRs and PRs not written by the team route differently)",
      );
      expect(reviewerText(undefined)).toBe("reviewer: none (no path rules for this repository)");
    });

    test("reads both sides of a rename, so moving a file out of a folder still counts", async () => {
      const get: GitHubGet = async (path) => {
        expect(path).toBe("/repos/acme/website/pulls/12/files?per_page=100&page=1");
        return [
          {
            filename: "scripts/deploy.ts",
            previous_filename: "infra/deploy.ts",
            additions: 2,
            deletions: 1,
          },
        ];
      };
      const files = await changedFiles(get, "acme/website", 12);
      expect(files).toEqual({
        paths: ["infra/deploy.ts", "scripts/deploy.ts"],
        lines: { "infra/deploy.ts": 0, "scripts/deploy.ts": 3 },
      });
      expect(reviewerByPaths(rules, files, 3, routing).person).toBe("priya");
    });

    test("counts a renamed file's lines once, under its new name", async () => {
      const get: GitHubGet = async () => [
        {
          filename: "src/kernel/step.ts",
          previous_filename: "src/kernel/run.ts",
          additions: 500,
          deletions: 200,
        },
      ];
      const files = await changedFiles(get, "acme/website", 12);
      expect(files.lines).toEqual({ "src/kernel/run.ts": 0, "src/kernel/step.ts": 700 });
      // Counted on both sides, 1,400 lines would pass the kernel's 800.
      expect(reviewerByPaths(rules, files, 700, routing).person).toBe("mateo");
    });

    test("keeps each file's count when two files swap names", async () => {
      const get: GitHubGet = async () => [
        { filename: "src/a.ts", previous_filename: "src/b.ts", additions: 4, deletions: 0 },
        { filename: "src/b.ts", previous_filename: "src/a.ts", additions: 5, deletions: 0 },
      ];
      const files = await changedFiles(get, "acme/website", 12);
      expect(files.lines).toEqual({ "src/a.ts": 4, "src/b.ts": 5 });
    });
  });
});

verifies("runtime.github-reviewer-approval-note", () => {
  describe("the default reviewer's note", () => {
    const mateo = { by: "Mateo", head: "7651f8c", counts: true };
    const liam = { by: "Liam", head: "7651f8c", counts: true };
    const signedByMateo = (by: string) => by.toLowerCase() === "mateo";

    test("notes the default reviewer's counting approval, and no one else's", () => {
      const reviewer = reviewerByPaths(rules, filesAt(["src/cart.ts"]), 3, routing);
      expect(noteDefaultReviewer([mateo, liam], rules, reviewer, signedByMateo)).toEqual([
        { ...mateo, note: defaultReviewerNote },
        liam,
      ]);
    });

    test("adds no note when the paths escalate, no one covers the role or there are no rules", () => {
      const escalated = reviewerByPaths(rules, filesAt(["infra/deploy.ts"]), 3, routing);
      const uncovered = reviewerByPaths(rules, filesAt(["src/cart.ts"]), 3, undefined);
      expect(noteDefaultReviewer([mateo], rules, escalated, signedByMateo)).toEqual([mateo]);
      expect(noteDefaultReviewer([mateo], rules, uncovered, signedByMateo)).toEqual([mateo]);
      expect(noteDefaultReviewer([mateo], undefined, undefined, signedByMateo)).toEqual([mateo]);
    });

    test("leaves an approval that doesn't count as it is", () => {
      const older = { ...mateo, head: "0000000", counts: false, note: "names an older head" };
      const reviewer = reviewerByPaths(rules, filesAt(["src/cart.ts"]), 3, routing);
      expect(noteDefaultReviewer([older], rules, reviewer, signedByMateo)).toEqual([older]);
    });
  });
});
