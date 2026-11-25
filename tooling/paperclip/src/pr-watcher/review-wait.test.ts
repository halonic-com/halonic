import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agents, type FakeTask, task } from "./fakes.test-helper.ts";
import { mateoBranch, open, repo, setup } from "./handoff.test-helper.ts";

/** The note for a green head that waits for its review for over an hour (HAL-17760). The pass runs at 17:00 UTC. */

/** The watcher's "ready for review" comment for head `5701aaa`, written at `createdAt`. */
function handedOver(createdAt: string) {
  return {
    authorAgentId: null,
    authorUserId: null,
    createdAt,
    body: `PR watcher: ready for review: #5701, head \`5701aaa\`.\n<!-- pr-watcher: ${repo}#5701 5701aaa ready -->`,
  };
}

function watcher(options: { held?: FakeTask; handedAt?: string; extra?: Partial<PullFacts> }) {
  return setup({
    tasks: [options.held ?? task(5701, agents.liam, { branch: mateoBranch })],
    pulls: [open(5701, mateoBranch, options.extra)],
    comments: { "task-5701": [handedOver(options.handedAt ?? "2026-11-24T15:59:00Z")] },
  });
}

function notes(run: ReturnType<typeof watcher>): string[] {
  return (run.comments["task-5701"] ?? [])
    .map(({ body }) => body)
    .filter((body) => body.startsWith("PR watcher: waiting for review"));
}

verifies("paperclip.pr-watcher-review-wait", () => {
  test("notes a green head handed over 61 minutes ago and not approved, once over two passes", async () => {
    const run = watcher({});
    expect(await run.run()).toMatchObject({ reviewWaits: 1, woken: 0, handedOff: 0, failed: [] });
    expect(await run.run()).toMatchObject({ reviewWaits: 0, failed: [] });
    expect(notes(run)).toHaveLength(1);
    expect(notes(run)[0]?.split("\n")[0]).toBe(
      "PR watcher: waiting for review for over 1 h: #5701, head `5701aaa`, handed over at 24 Nov 16:59 CET.",
    );
    expect(run.wakes).toEqual([]);
    expect(run.handoffs).toEqual([]);
  });

  test("names a required check with no run on the head next to the missing approval", async () => {
    const run = watcher({ extra: { missingChecks: ["Guard notes"] } });
    expect(await run.run()).toMatchObject({ reviewWaits: 1 });
    expect(notes(run)[0]?.split("\n")[0]).toBe(
      "PR watcher: waiting for review for over 1 h: #5701, head `5701aaa`, handed over at 24 Nov 16:59 CET; no `Guard notes` run on this head.",
    );
  });

  test("notes it for Julian too", async () => {
    const run = watcher({ held: task(5701, agents.julian, { branch: mateoBranch }) });
    expect(await run.run()).toMatchObject({ reviewWaits: 1 });
  });

  test("says nothing for a head handed over 59 minutes ago", async () => {
    const run = watcher({ handedAt: "2026-11-24T16:01:00Z" });
    expect(await run.run()).toMatchObject({ reviewWaits: 0 });
    expect(notes(run)).toEqual([]);
  });

  test("says nothing when it is approved on its head", async () => {
    const run = watcher({ extra: { approvals: [{ by: "Liam", head: "5701aaa" }] } });
    expect(await run.run()).toMatchObject({ reviewWaits: 0 });
    expect(notes(run)).toEqual([]);
  });

  test("says nothing while its author holds the task", async () => {
    const run = watcher({ held: task(5701, agents.mateo, { branch: mateoBranch }) });
    expect(await run.run()).toMatchObject({ reviewWaits: 0 });
    expect(notes(run)).toEqual([]);
  });

  test("says nothing for Liam's own pull request while Liam holds it", async () => {
    const run = setup({
      tasks: [task(5701, agents.liam, { branch: "liam/HAL-5701-work" })],
      pulls: [open(5701, "liam/HAL-5701-work")],
      comments: { "task-5701": [handedOver("2026-11-24T15:00:00Z")] },
    });
    expect(await run.run()).toMatchObject({ reviewWaits: 0 });
  });

  test("says nothing while the reviewer is running on it, or the head is a draft, red, pending or in the queue", async () => {
    const quiet = [
      watcher({ held: task(5701, agents.liam, { branch: mateoBranch, running: true }) }),
      watcher({ extra: { draft: true } }),
      watcher({ extra: { ciOkOnHead: "failure" } }),
      watcher({ extra: { ciOkOnHead: "pending" } }),
      watcher({ extra: { inQueue: true } }),
    ];
    for (const run of quiet) {
      expect(await run.run()).toMatchObject({ reviewWaits: 0, failed: [] });
    }
  });

  test("says nothing for a new head the watcher hasn't handed over", async () => {
    const run = watcher({ extra: { head: "5702cccccccccccccccccccccccccccccccccccc" } });
    expect(await run.run()).toMatchObject({ reviewWaits: 0 });
  });
});
