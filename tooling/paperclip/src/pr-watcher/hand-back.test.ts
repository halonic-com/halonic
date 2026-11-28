import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agentComment, agents, type FakeTask, task } from "./fakes.test-helper.ts";
import { mateoBranch, oldHead, open, repo, setup } from "./handoff.test-helper.ts";
import type { CommentRow } from "./paperclip.ts";

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

/** A comment the watcher wrote earlier, with the marker of `key`. */
function watcherComment(key: string): CommentRow {
  const body = `PR watcher: back to Mateo after review.\n<!-- pr-watcher: ${key} -->`;
  return { authorAgentId: null, authorUserId: null, createdAt: "2026-11-24T16:40:00Z", body };
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
        key: "halonic-com/halonic#5701 5701aaa back to author approved",
      },
    ]);
    expect(run.comments["task-5701"]?.[0]?.body.split("\n")).toEqual([
      "PR watcher: back to Mateo after review, head `5701aaa` (HAL-21150).",
      "- [#5701](https://github.com/halonic-com/halonic/pull/5701)",
      "<!-- pr-watcher: halonic-com/halonic#5701 5701aaa back to author approved -->",
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

  test("hands back once per verdict: again for a new finding on the same head, not for the same one", async () => {
    const earlier = watcherComment("halonic-com/halonic#5701 5701aaa back to author i1");
    const first = { id: "i1", at: "2026-11-24T16:30:00Z", by: "Julian" };
    const same = watcher({ latestReview: first }, undefined, { "task-5701": [earlier] });
    expect(await same.run()).toMatchObject({ handedBack: 0, failed: [] });
    expect(same.handoffs).toEqual([]);
    const second = { id: "i2", at: "2026-11-24T16:50:00Z", by: "Julian" };
    const again = watcher({ latestReview: second }, undefined, { "task-5701": [earlier] });
    expect(await again.run()).toMatchObject({ handedBack: 1 });
    expect(again.handoffs.map(({ key }) => key)).toEqual([
      "halonic-com/halonic#5701 5701aaa back to author i2",
    ]);
  });

  test("leaves a head merge control holds with its reviewer: an approval hands it back first", async () => {
    const run = watcher({ held: { url: "https://example.test/run", jobs: [], error: null } });
    expect(await run.run()).toMatchObject({ handedBack: 0 });
    expect(run.handoffs).toEqual([]);
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
    const body = run.comments["task-5701"]?.at(-1)?.body ?? "";
    expect(body).toContain("back to Mateo after the merge");
    // The author's later pass reads the merge as reported: one wake for that comment, not two.
    expect(body).toContain("<!-- pr-watcher: halonic-com/halonic#5701 5701aaa merged -->");
  });

  test("closes a landed task it gave back after the merge once nothing keeps it open", async () => {
    const earlier = watcherComment("halonic-com/halonic#5701 5701aaa back to author merged");
    const run = watcher(merged, undefined, { "task-5701": [earlier] });
    expect(await run.run()).toMatchObject({ done: 1, handedBack: 0, failed: [] });
    expect(run.done).toEqual(["task-5701"]);
  });

  test("gives a task back for its second merge after the first one's hand-back", async () => {
    const second = { ...merged, head: oldHead, mergedAt: "2026-11-24T16:20:00Z" };
    const earlier = watcherComment("halonic-com/halonic#5701 5701aaa back to author merged");
    const after = agentComment(agents.priya, "2026-11-24T16:30:00Z", "One more deploy step.");
    const run = twoPulls(merged, second, [earlier, after]);
    expect(await run.run()).toMatchObject({ done: 0, handedBack: 1, failed: [] });
    expect(run.handoffs.map(({ to, key }) => [to, key])).toEqual([
      [agents.mateo, "halonic-com/halonic#5702 4999bbb back to author merged"],
    ]);
  });

  test("gives a task back for a finding on its second pull request after the first one's approval", async () => {
    const earlier = watcherComment("halonic-com/halonic#5701 5701aaa back to author approved");
    const finding = { id: "i3", at: "2026-11-24T16:30:00Z", by: "Julian" };
    const run = twoPulls(
      { approvals: [{ by: "Julian", head: "5701aaa" }] },
      { head: oldHead, latestReview: finding },
      [earlier],
    );
    expect(await run.run()).toMatchObject({ handedBack: 1, failed: [] });
    expect(run.handoffs.map(({ to, key }) => [to, key])).toEqual([
      [agents.mateo, "halonic-com/halonic#5702 4999bbb back to author i3"],
    ]);
  });

  test("gives a task back after a finding when GitHub committed the head after it", async () => {
    const finding = { id: "i1", at: "2026-11-24T14:00:00Z", by: "Julian" };
    const run = watcher({ latestReview: finding, headCommittedByGitHub: true });
    expect(await run.run()).toMatchObject({ handedBack: 1, failed: [] });
  });
});

/** Julian holds HAL-5701 with Mateo's pull requests #5701 and #5702. */
function twoPulls(first: Partial<PullFacts>, second: Partial<PullFacts>, comments: CommentRow[]) {
  const held = task(5701, agents.julian, { branch: mateoBranch });
  const refs = [5701, 5702].map((number) => ({ repo, number, branch: mateoBranch }));
  return setup({
    tasks: [{ ...held, pulls: refs }],
    pulls: [
      open(5701, mateoBranch, { headCommittedAt: committedAt, ...first }),
      open(5702, mateoBranch, { headCommittedAt: committedAt, ...second }),
    ],
    comments: { "task-5701": comments },
  });
}
