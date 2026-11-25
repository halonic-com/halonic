import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { fakeGitHub } from "./fakes.test-helper.ts";
import { gitHubRoute } from "./route.ts";

const repo = "halonic-com/halonic";
const head = "5701aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** GitHub's answers for pull request 5701 changing these files, 40 lines in all. */
function answers(files: readonly string[]) {
  return {
    [`/repos/${repo}/pulls/5701`]: {
      additions: 30,
      deletions: 10,
      base: { ref: "main" },
      head: { sha: head, ref: "mateo/HAL-5701-work" },
    },
    [`/repos/${repo}/pulls/5701/files?per_page=100&page=1`]: files.map((filename) => ({
      filename,
      status: "modified",
    })),
    [`/repos/${repo}/compare/main...${head}`]: { merge_base_commit: { sha: "base1234" } },
  };
}

const pull = { repo, number: 5701, head } as PullFacts;

verifies("paperclip.pr-watcher-handoff", () => {
  test("routes by the changed files the way pr_status does, sending only GET requests", async () => {
    const julians = fakeGitHub(answers(["tooling/paperclip/src/pr-watcher/watch.ts"]));
    expect(await gitHubRoute(julians.get)(pull)).toEqual({
      reviewer: "julian",
      security: false,
      rebaseRefusal: null,
    });
    expect(julians.calls.every(({ method }) => method === "GET")).toBe(true);
    const liams = fakeGitHub(answers([".github/workflows/ci.yml"]));
    expect(await gitHubRoute(liams.get)(pull)).toEqual({
      reviewer: "liam",
      security: false,
      rebaseRefusal: null,
    });
    const fence = fakeGitHub(answers(["packages/x/src/sandbox/fence.ts"]));
    expect(await gitHubRoute(fence.get)(pull)).toEqual({
      reviewer: "liam",
      security: true,
      rebaseRefusal: "a security pull request by its paths (packages/x/src/sandbox/fence.ts)",
    });
  });
});
