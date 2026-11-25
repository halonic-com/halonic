import type { RepositoryReviewerRules, Routing } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { GitHubGet } from "../github.ts";
import { changedPaths, reviewerByPaths, reviewerText, reviewRoleByPaths } from "./reviewer-role.ts";

/**
 * Rules shaped like the ones Liam asked for on HAL-18289, written for the
 * invented `acme/website`: exact files, folders, words with the same skip
 * regexes as `isTestPath` / `isWordsOnly`, a 1200-line limit and any nested
 * `package.json`.
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
  lineLimit: { max: 1200, skip: [...testPath, "\\.md$"] },
  nestedPackageJson: true,
};

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
    ] as const)("%s", (_, paths, lines, role) => {
      expect(reviewRoleByPaths(rules, paths, lines)).toBe(role);
    });

    test("only the rules a repository gives fire: no line limit means none", () => {
      const { lineLimit: _, ...noLimit } = rules;
      expect(reviewRoleByPaths(noLimit, ["src/cart.ts"], 99_999)).toBe("second-reviewer");
    });
  });

  describe("the person and the answer", () => {
    test("names who the routing gives the role, and says it is by paths only", () => {
      const reviewer = reviewerByPaths(rules, ["infra/deploy.ts"], 3, routing);
      expect(reviewer).toEqual({ role: "code-reviewer", person: "priya" });
      expect(reviewerText(reviewer)).toBe(
        "reviewer: priya as code-reviewer (by paths; security/release PRs and the author's own PRs route differently)",
      );
    });

    test("names the role alone when no one covers it, and says when there are no rules", () => {
      const reviewer = reviewerByPaths(rules, ["src/cart.ts"], 3, undefined);
      expect(reviewerText(reviewer)).toBe(
        "reviewer: second-reviewer, no one covers it in the routing (by paths; security/release PRs and the author's own PRs route differently)",
      );
      expect(reviewerText(undefined)).toBe("reviewer: none (no path rules for this repository)");
    });

    test("reads both sides of a rename, so moving a file out of a folder still counts", async () => {
      const get: GitHubGet = async (path) => {
        expect(path).toBe("/repos/acme/website/pulls/12/files?per_page=100&page=1");
        return [{ filename: "scripts/deploy.ts", previous_filename: "infra/deploy.ts" }];
      };
      const paths = await changedPaths(get, "acme/website", 12);
      expect(paths).toEqual(["scripts/deploy.ts", "infra/deploy.ts"]);
      expect(reviewerByPaths(rules, paths, 3, routing).person).toBe("priya");
    });
  });
});
