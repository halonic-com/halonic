import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { agentComment, agents, fakeGitHub, task } from "./fakes.test-helper.ts";
import { head, mateoBranch, oldHead, open, repo, setup } from "./handoff.test-helper.ts";
import type { Reviewer } from "./handoff.ts";
import { gitHubRebaseOnly, sameChanges } from "./rebase-only.ts";

/** The re-review after a push to an approved pull request (HAL-17759), on facts given directly. */

const approvedByLiam = open(5701, mateoBranch, { approvals: [{ by: "Liam", head: "4999bbb" }] });

function watcher(
  rebaseOnly: (pull: unknown, approved: string) => Promise<boolean>,
  files: readonly string[] = [],
  byPaths: Reviewer = "liam",
) {
  const compared: string[] = [];
  const run = setup({
    tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
    pulls: [approvedByLiam],
    byPaths,
    files,
    rebaseOnly: (pull, approved) => {
      compared.push(approved);
      return rebaseOnly(pull, approved);
    },
  });
  return { ...run, compared };
}

/** The handoff comment, after the push-after-approval warning. */
function handoffBody(comments: Record<string, { body: string }[]>): string {
  return (
    (comments["task-5701"] ?? []).find(({ body }) => body.includes("ready for review"))?.body ?? ""
  );
}

function patch(start: number) {
  return { filename: "a.ts", status: "modified", patch: `@@ -${start},2 +${start},3 @@\n x\n+y` };
}

verifies("paperclip.pr-watcher-rereview", () => {
  test("records a rebase-only push after Liam's approval on Liam's paths as carried over, with no review round (HAL-18460)", async () => {
    const rebased = watcher(async () => true, ["pnpm-lock.yaml"]);
    expect(await rebased.run()).toMatchObject({ handedOff: 0, warned: 0, failed: [] });
    expect(rebased.compared).toEqual(["4999bbb"]);
    expect(rebased.handoffs).toEqual([]);
    const [note] = rebased.comments["task-5701"] ?? [];
    expect(note?.body).toContain(
      "PR watcher: only a rebase since the approval, so no new review round.",
    );
    expect(note?.body).not.toContain("this voids the approval");
  });

  test("sends a rebase-only push after Liam's approval on Liam's paths to Julian when it doesn't carry over (HAL-18459)", async () => {
    const rebased = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [{ ...approvedByLiam, repo: "halonic-com/cloud" }],
      byPaths: "liam",
      files: ["pnpm-lock.yaml"],
      rebaseOnly: async () => true,
    });
    expect(await rebased.run()).toMatchObject({ handedOff: 1, failed: [] });
    expect(rebased.handoffs.map(({ to }) => to)).toEqual([agents.julian]);
    const body = handoffBody(rebased.comments);
    expect(body).toContain("#5701: only a rebase since Liam's approval on `4999bbb`");
    expect(body).toContain(
      '"Julian: re-approved on head `5701aaa` (rebase only, range-diff vs `4999bbb`)"',
    );
  });

  test("sends a rebase-only push on Liam's own pull request after Julian's approval to Julian, with the re-approval line", async () => {
    const liamBranch = "liam/HAL-5701-work";
    const rebased = setup({
      tasks: [task(5701, agents.liam, { branch: liamBranch })],
      pulls: [open(5701, liamBranch, { approvals: [{ by: "Julian", head: "4999bbb" }] })],
      byPaths: "liam",
      rebaseOnly: async () => true,
    });
    expect(await rebased.run()).toMatchObject({ handedOff: 1, failed: [] });
    expect(rebased.handoffs.map(({ to }) => to)).toEqual([agents.julian]);
    expect(handoffBody(rebased.comments)).toContain(
      '"Julian: re-approved on head `5701aaa` (rebase only, range-diff vs `4999bbb`)"',
    );
  });

  test("sends a rebase-only push after Liam's approval on a security path to Liam", async () => {
    const security = watcher(async () => true, ["packages/x/src/sandbox/fence.ts"]);
    expect(await security.run()).toMatchObject({ handedOff: 1, failed: [] });
    expect(security.compared).toEqual([]);
    expect(security.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
    const body = handoffBody(security.comments);
    expect(body).toContain("#5701: a security pull request by its paths");
    expect(body).toContain("review `4999bbb`..`5701aaa`.");
    expect(body).not.toContain("Julian: re-approved");
  });

  test("sends a changed head to the reviewer of its paths once, naming both heads", async () => {
    const changed = watcher(async () => false);
    await changed.run();
    await changed.run();
    expect(changed.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
    const body = handoffBody(changed.comments);
    expect(body).toContain(
      "#5701: changed since Liam's approval on `4999bbb`; review `4999bbb`..`5701aaa`.",
    );
    expect(body).not.toContain("re-approved");
  });

  test("treats a failed comparison as a change", async () => {
    const failed = watcher(async () => {
      throw new Error("GitHub: GET /compare answered 404.");
    });
    expect(await failed.run()).toMatchObject({ handedOff: 1, failed: [] });
    expect(failed.handoffs.map(({ to }) => to)).toEqual([agents.liam]);
  });

  test("never routes a security or release pull request that has its own review task", async () => {
    const own = setup({
      tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
      pulls: [approvedByLiam],
      byPaths: "liam",
      comments: {
        "task-5701": [
          agentComment(agents.mateo, "2026-11-24T16:00:00Z", "PR watcher: own review task"),
        ],
      },
      rebaseOnly: async () => {
        throw new Error("compared a pull request with its own review task");
      },
    });
    await own.run();
    expect(own.handoffs).toEqual([]);
  });

  test("matches changes whose hunks only moved, and nothing GitHub lists without a patch", () => {
    expect(sameChanges([patch(10)], [patch(42)])).toBe(true);
    expect(sameChanges([patch(10)], [{ ...patch(10), patch: "@@ -10,2 +10,3 @@\n x\n+z" }])).toBe(
      false,
    );
    expect(sameChanges([patch(10)], [patch(10), { ...patch(1), filename: "b.ts" }])).toBe(false);
    expect(sameChanges([{ filename: "logo.png", status: "modified" }], [])).toBe(false);
  });

  test("compares on GitHub with GET requests only", async () => {
    const github = fakeGitHub({
      [`/repos/${repo}/pulls/5701`]: { base: { ref: "main" } },
      [`/repos/${repo}/compare/main...${oldHead}`]: { files: [patch(10)] },
      [`/repos/${repo}/compare/main...${head}`]: { files: [patch(12)] },
    });
    expect(await gitHubRebaseOnly(github.get)(open(5701, mateoBranch), oldHead)).toBe(true);
    expect(github.calls.every(({ method }) => method === "GET")).toBe(true);
  });
});
