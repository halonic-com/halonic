import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { agents, task } from "./fakes.test-helper.ts";
import { mateoBranch, open, setup } from "./handoff.test-helper.ts";
import type { CommentRow } from "./paperclip.ts";
import { queueRequestsOf, unneeded } from "./unneeded-rebase.ts";

/** The note on a rebase nobody asked for after an approval (HAL-18722), on facts given directly. */

const text = "unneeded rebase after approval (no conflict, no queue request)";

/** A comment by no agent and no user: the watcher's when it starts with its name. */
function hostComment(createdAt: string, body: string): CommentRow {
  return { authorAgentId: null, authorUserId: null, createdAt, body };
}

function watcher(rebaseOnly: boolean, comments: CommentRow[] = []) {
  return setup({
    tasks: [task(5701, agents.mateo, { branch: mateoBranch })],
    pulls: [open(5701, mateoBranch, { approvals: [{ by: "Liam", head: "4999bbb" }] })],
    byPaths: "liam",
    comments: { "task-5701": comments },
    rebaseOnly: async () => rebaseOnly,
  });
}

function notes(run: ReturnType<typeof watcher>): string[] {
  return (run.comments["task-5701"] ?? [])
    .map(({ body }) => body)
    .filter((body) => body.includes(text));
}

verifies("paperclip.pr-watcher-unneeded-rebase", () => {
  test("notes a rebase-only push after an approval with no conflict and no queue request once, waking nobody", async () => {
    const rebased = watcher(true);
    await rebased.run();
    await rebased.run();
    expect(notes(rebased)).toHaveLength(1);
    expect(notes(rebased)[0]).toContain(`PR watcher: ${text}.`);
    expect(notes(rebased)[0]).toContain("Liam approved `4999bbb`; `5701aaa`");
    expect(rebased.wakes).toEqual([]);
    expect(rebased.handoffs).toEqual([]);
  });

  test("says nothing when the watcher reported a conflict on the approved head", async () => {
    const conflicted = watcher(true, [
      hostComment(
        "2026-11-24T15:00:00Z",
        "PR watcher: this needs you.\n<!-- pr-watcher: halonic-com/halonic#5701 4999bbb conflict -->",
      ),
    ]);
    await conflicted.run();
    expect(notes(conflicted)).toEqual([]);
  });

  test("says nothing when the queue manager's wake named the approved head", async () => {
    const asked = watcher(true, [
      hostComment(
        "2026-11-24T15:00:00Z",
        "Queue manager: #5701 (head `4999bbbbb`) was removed from the merge queue: conflicts with main: please rebase.",
      ),
    ]);
    await asked.run();
    expect(notes(asked)).toEqual([]);
  });

  test("says nothing about a push that changed a line", async () => {
    const changed = watcher(false);
    await changed.run();
    expect(notes(changed)).toEqual([]);
  });

  test("says nothing on a repository without a merge queue, where a branch behind main can't merge", () => {
    const since = { by: "Liam", approvedHead: "4999bbb", rebaseOnly: true };
    const memory = {
      reported: new Set<string>(),
      seenUntil: undefined,
      heldAt: undefined,
      lastCommentAt: undefined,
    };
    const pull = open(5701, mateoBranch);
    expect(unneeded(pull, since, memory)).toBe(true);
    expect(unneeded({ ...pull, repo: "halonic-com/cloud" }, since, memory)).toBe(false);
  });

  test("reads the pull request and head from the queue manager's wake lines", () => {
    expect(
      queueRequestsOf([
        "Queue manager: #5701 (head `4999bbbbb`) was taken out of the merge queue: its merge group failed",
        "Queue manager: approved and `ci-ok` is green",
      ]),
    ).toEqual([{ number: 5701, head: "4999bbbbb" }]);
  });
});
