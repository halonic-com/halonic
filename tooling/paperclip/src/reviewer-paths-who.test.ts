import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { PullDetails } from "./pr-tools/pr-status.ts";
import type { GitHubGet } from "./pr-watcher/github.ts";
import { reviewerAnswer } from "./pr-watcher/route.ts";
import type { RoutedPull } from "./reviewer-paths.ts";
import { reviewerOfPull } from "./reviewer-paths-who.ts";
import { snapshotWith } from "./routing.test-helper.ts";
import { routingOf } from "./routing-load.ts";

const repo = "halonic-com/halonic";

/** A GitHub that knows one pull request on `branch`, changing `files` by 120 lines each. */
function gitHubWith(branch: string, files: readonly string[]): GitHubGet {
  const pull: PullDetails = {
    html_url: `https://github.com/${repo}/pull/1`,
    title: "acme",
    state: "open",
    merged_at: null,
    mergeable: true,
    additions: 100,
    deletions: 20,
    head: { sha: "a".repeat(40), ref: branch, repo: { full_name: repo } },
    user: { login: "halonic-dev" },
    base: { ref: "main" },
  };
  const answers: Readonly<Record<string, unknown>> = {
    [`/repos/${repo}/pulls/1`]: pull,
    [`/repos/${repo}/pulls/1/files?per_page=100&page=1`]: files.map((filename) => ({
      filename,
      status: "modified",
      changes: 120,
    })),
    [`/repos/${repo}/compare/main...${"a".repeat(40)}`]: { merge_base_commit: { sha: "b" } },
  };
  return async (path) => {
    if (!(path in answers)) {
      throw new Error(`unexpected GET ${path}`);
    }
    return answers[path];
  };
}

const studio = ["packages/studio/features/inbox/src/view.tsx"];

verifies("paperclip.reviewer-source", () => {
  describe("who reviews a pull request (HAL-19639)", () => {
    test("the shared answer names Nora for a routine pull request", async () => {
      const answer = await reviewerAnswer(gitHubWith("ravi/HAL-1-acme", studio), repo, 1);
      expect(answer).toEqual({
        repo,
        number: 1,
        head: "a".repeat(40),
        author: "ravi",
        reviewer: "nora",
        role: "routine-reviewer",
        routineRefusal: null,
      });
    });

    test("the shared answer never names the author", async () => {
      const reviewerOn = async (branch: string) =>
        (await reviewerAnswer(gitHubWith(branch, studio), repo, 1)).reviewer;
      expect(await reviewerOn("nora/HAL-1-acme")).toBe("julian");
      expect(await reviewerOn("liam/HAL-1-acme")).toBe("julian");
      expect(await reviewerOn("julian/HAL-1-acme")).toBe("liam");
    });

    test("a routing never names the author either (HAL-19653)", () => {
      const routing = routingOf(
        snapshotWith({
          roles: { "code-reviewer": "owen", "second-reviewer": "kim", "routine-reviewer": "pip" },
        }),
      );
      const routine: RoutedPull = {
        files: studio,
        changedLines: 120,
        sensitive: false,
        ours: true,
      };
      const core: RoutedPull = {
        files: ["package.json"],
        changedLines: 2,
        sensitive: false,
        ours: true,
      };
      expect(reviewerOfPull(routine, "ravi", routing)).toBe("pip");
      expect(reviewerOfPull(routine, "pip", routing)).toBe("kim");
      expect(reviewerOfPull(routine, "kim", routing)).toBe("pip");
      expect(reviewerOfPull(core, "owen", routing)).toBe("kim");
      expect(reviewerOfPull(core, undefined, routing)).toBe("owen");
    });

    test("the shared answer names Liam for his paths", async () => {
      const answer = await reviewerAnswer(gitHubWith("ravi/HAL-1-acme", ["package.json"]), repo, 1);
      expect(answer.reviewer).toBe("liam");
      expect(answer.role).toBe("code-reviewer");
    });
  });
});

const sourceRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * A line that decides a reviewer from reviewers' names: a comparison with
 * one name that picks another, or a list of two or more names.
 */
const name = `"(?:liam|julian|nora)/?"`;
const decidesReviewer = new RegExp(
  [
    `(?:===|!==|startsWith\\()\\s*${name}\\)?\\s*\\?\\s*${name}`,
    `\\[\\s*${name}\\s*,\\s*${name}`,
  ].join("|"),
  "i",
);

/** Files that may decide or name reviewers: the source itself. */
function isSource(path: string): boolean {
  return path === "routing.ts" || path.startsWith("reviewer-paths");
}

/**
 * Files that still decide on their own, each with why. The list may only
 * shrink: a fixed file left here fails too.
 */
const knownCopies: Readonly<Record<string, string>> = {
  // Signature parsers: the names whose signed line is read, not who reviews.
  "merge-control/facts-patch-ids.ts": "reads Liam's, Julian's and Nora's signed lines",
  "pr-tools/approvals.ts": "reads Liam's, Julian's and Nora's signed lines",
  // Defaults in the plugin manifest and its import closure, which the plugin deployer pins
  // (`MANIFEST_IMPORTS`): who counts as a reviewer, not who reviews a pull request. Importing
  // the source there would pull it into the closure (HAL-19653).
  "plugin/manifest.ts": "the effort reviewers' default in the plugin manifest",
  "seat-mover/settings.ts": "the seat mover's reviewers' default, in the manifest's closure",
  "task-effort/settings.ts": "the effort reviewers' default, in the manifest's closure",
};

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : sourceFiles(path);
    }
    const code = entry.name.endsWith(".ts") && !/\.test(-helper)?\.ts$/.test(entry.name);
    return code ? [relative(sourceRoot, path)] : [];
  });
}

verifies("paperclip.reviewer-source", () => {
  describe("no second reviewer list (HAL-19639)", () => {
    const found = sourceFiles(sourceRoot)
      .filter((path) => !isSource(path))
      .flatMap((path) =>
        readFileSync(join(sourceRoot, path), "utf8")
          .split("\n")
          .flatMap((line, index) => (decidesReviewer.test(line) ? [`${path}:${index + 1}`] : [])),
      );

    test("no file outside the source decides a reviewer by name", () => {
      const fileOf = (at: string) => at.slice(0, at.lastIndexOf(":"));
      expect(found.filter((at) => !(fileOf(at) in knownCopies))).toEqual([]);
    });

    test("every known copy is still one, so the list only shrinks", () => {
      const files = new Set(found.map((at) => at.slice(0, at.lastIndexOf(":"))));
      expect(Object.keys(knownCopies).filter((path) => !files.has(path))).toEqual([]);
    });

    test("the pattern catches the copies it is meant for", () => {
      expect(decidesReviewer.test(`return branch === "liam" ? "Julian" : "Liam";`)).toBe(true);
      expect(decidesReviewer.test(`return b.startsWith("liam/") ? "Julian" : "Liam";`)).toBe(true);
      expect(decidesReviewer.test(`const reviewers = ["liam", "julian"];`)).toBe(true);
      expect(decidesReviewer.test(`if (author === "liam") {`)).toBe(false);
    });
  });
});
