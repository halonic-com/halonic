import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agentComment, agents, type FakeTask, task } from "./fakes.test-helper.ts";
import { mateoBranch, oldHead, open, setup } from "./handoff.test-helper.ts";

/** The hand-back of a reviewer-held task to its author (HAL-21150). The pass runs at 17:00 UTC. */

const committedAt = "2026-11-24T15:00:00Z";

function watcher(
  pull: Partial<PullFacts>,
  held: FakeTask = task(5701, agents.julian, { branch: mateoBranch }),
  comments: Parameters<typeof setup>[0]["comments"] = {},
) {
  return setup({
    tasks: [held],
    pulls: [open(5701, mateoBranch, { headCommittedAt: committedAt, ...pull })],
    comments,
  });
}

const merged: Partial<PullFacts> = {
  state: "merged",
  landed: true,
  mergedAt: "2026-11-24T16:00:00Z",
};

verifies("paperclip.pr-watcher-hand-back", () => {
  test("gives a task Julian approved on its head back to its author, once over two passes", async () => {
    const run = watcher({ approvals: [{ by: "Julian", head: "5701aaa" }] });
    expect(await run.run()).toMatchObject({ handedBack: 1, failed: [] });
    expect(await run.run()).toMatchObject({ handedBack: 0, failed: [] });
    expect(run.handoffs).toEqual([
      {
        taskId: "task-5701",
        from: agents.julian,
        to: agents.mateo,
        key: "halonic-com/halonic#5701 5701aaa back to author",
      },
    ]);
    expect(run.comments["task-5701"]?.[0]?.body.split("\n")).toEqual([
      "PR watcher: back to Mateo after review, head `5701aaa` (HAL-21150).",
      "- [#5701](https://github.com/halonic-com/halonic/pull/5701)",
    ]);
  });

  test("gives a task back after Nora's finding on its head", async () => {
    const finding = { id: "i1", at: "2026-11-24T16:30:00Z", by: "Nora" };
    const run = watcher(
      { latestReview: finding },
      task(5701, agents.nora, { branch: mateoBranch }),
    );
    expect(await run.run()).toMatchObject({ handedBack: 1 });
    expect(run.handoffs.map(({ from, to }) => [from, to])).toEqual([[agents.nora, agents.mateo]]);
  });

  test("gives a task back when merge control holds its head", async () => {
    const run = watcher({ held: { url: "https://example.test/run", jobs: [], error: null } });
    expect(await run.run()).toMatchObject({ handedBack: 1 });
    expect(run.comments["task-5701"]?.[0]?.body).toContain("after the merge queue held it");
  });

  test("leaves the task with its reviewer before a verdict on the head", async () => {
    const stale = { id: "i1", at: "2026-11-24T14:00:00Z", by: "Julian" };
    for (const pull of [
      {},
      { approvals: [{ by: "Julian", head: oldHead.slice(0, 7) }] },
      { approvals: [{ by: "Liam", head: "5701aaa" }] },
      { latestReview: stale },
      { approvals: [{ by: "Julian", head: "5701aaa" }], draft: true },
    ]) {
      const run = watcher(pull);
      expect(await run.run()).toMatchObject({ handedBack: 0, failed: [] });
      expect(run.handoffs).toEqual([]);
    }
  });

  test("leaves a reviewer's running task and a parked task alone", async () => {
    const approved = { approvals: [{ by: "Julian", head: "5701aaa" }] };
    for (const held of [
      task(5701, agents.julian, { branch: mateoBranch, running: true }),
      task(5701, agents.julian, { branch: mateoBranch, parked: true }),
    ]) {
      const run = watcher(approved, held);
      expect(await run.run()).toMatchObject({ handedBack: 0 });
      expect(run.handoffs).toEqual([]);
    }
  });

  test("closes a reviewer-held task once its pull request landed", async () => {
    const run = watcher(merged);
    expect(await run.run()).toMatchObject({ done: 1, handedBack: 0 });
    expect(run.done).toEqual(["task-5701"]);
    expect(run.handoffs).toEqual([]);
  });

  test("gives a landed task back to its author when it got a comment after the merge", async () => {
    const after = agentComment(agents.priya, "2026-11-24T16:30:00Z", "One more deploy step.");
    const run = watcher(merged, undefined, { "task-5701": [after] });
    expect(await run.run()).toMatchObject({ done: 0, handedBack: 1 });
    expect(run.comments["task-5701"]?.at(-1)?.body).toContain("back to Mateo after the merge");
  });
});
