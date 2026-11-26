import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "../pr-watcher/decide.ts";
import { fakeGitHub } from "../pr-watcher/fakes.test-helper.ts";
import { gitHubRoute } from "../pr-watcher/route.ts";
import { reviewerFor, reviewerRoleFor } from "../reviewer-paths.ts";
import { snapshotWith } from "../routing.test-helper.ts";
import { routingOf } from "../routing-load.ts";
import { outsideJulianScope } from "./approval.ts";
import { pull } from "./merge-control.test-helper.ts";

/**
 * The PR watcher's route and the merge control's approval read the same
 * rule (`reviewerRoleFor`, HAL-18296): a pull request the watcher hands to
 * the second reviewer is one the gate lets Julian approve, and the other way
 * round. A routing only renames who covers a role; it moves no pull request
 * into Julian's limits.
 */

const repo = "halonic-com/halonic";
const head = "6016aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** GitHub's answers for pull request 6016 changing these files, 40 lines in all. */
function answers(files: readonly string[]) {
  return {
    [`/repos/${repo}/pulls/6016`]: {
      additions: 30,
      deletions: 10,
      base: { ref: "main" },
      head: { sha: head, ref: "mateo/HAL-6016-work" },
    },
    [`/repos/${repo}/pulls/6016/files?per_page=100&page=1`]: files.map((filename) => ({
      filename,
      status: "modified",
    })),
    [`/repos/${repo}/compare/main...${head}`]: { merge_base_commit: { sha: "base1234" } },
  };
}

const cases: readonly (readonly string[])[] = [
  ["tooling/paperclip/src/pr-watcher/watch.ts"],
  ["docs/guides/review.md"],
  [".github/workflows/ci.yml"],
  ["packages/x/src/sandbox/fence.ts"],
  ["tooling/paperclip/src/reviewer-paths.ts"],
];

verifies("paperclip.pr-watcher-handoff", () => {
  test("the watcher's route and the gate's approval agree on the role for every pull request", async () => {
    for (const files of cases) {
      const route = await gitHubRoute(fakeGitHub(answers(files)).get)({
        repo,
        number: 6016,
        head,
      } as PullFacts);
      const gate = outsideJulianScope(pull(6016, { files, filesTotal: files.length }));
      expect({ files, julian: route.reviewer === "julian" }).toEqual({
        files,
        julian: gate === null,
      });
    }
  });

  test("a routing renames who covers the role but moves no pull request into Julian's limits", () => {
    const routing = routingOf(
      snapshotWith({ roles: { "code-reviewer": "owen", "second-reviewer": "kim" } }),
    );
    for (const files of cases) {
      const routed = { files, changedLines: 40, sensitive: false };
      const second = reviewerRoleFor(routed) !== "code-reviewer";
      expect(reviewerFor(routed, routing)).toBe(second ? "kim" : "owen");
      expect(outsideJulianScope(pull(6016, { files, filesTotal: files.length })) === null).toBe(
        second,
      );
    }
  });
});
