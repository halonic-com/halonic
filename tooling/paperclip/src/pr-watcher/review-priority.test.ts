import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { agents, type FakeTask, task } from "./fakes.test-helper.ts";
import { mateoBranch, open, repo, setup } from "./handoff.test-helper.ts";
import { longestWaitingLine } from "./review-wait.ts";

/** A long review wait raises the task to `high` and goes into the pass summary (HAL-17920). The pass runs at 17:00 UTC. */

/** The watcher's "ready for review" comment for head `5701aaa` of pull request `number`, written at `createdAt`. */
function handedOver(number: number, createdAt: string) {
  return {
    authorAgentId: null,
    authorUserId: null,
    createdAt,
    body: `PR watcher: ready for review: #${number}, head \`5701aaa\`.\n<!-- pr-watcher: ${repo}#${number} 5701aaa ready -->`,
  };
}

function liamHolds(number: number, priority?: string): FakeTask {
  return task(number, agents.liam, {
    branch: `mateo/HAL-${number}-work`,
    ...(priority === undefined ? {} : { priority }),
  });
}

function watcher(options: { held?: FakeTask; handedAt?: string; extra?: Partial<PullFacts> }) {
  return setup({
    tasks: [options.held ?? liamHolds(5701)],
    pulls: [open(5701, mateoBranch, options.extra)],
    comments: { "task-5701": [handedOver(5701, options.handedAt ?? "2026-11-24T15:59:00Z")] },
  });
}

verifies("paperclip.pr-watcher-review-priority", () => {
  test("raises a medium task to high once over two passes, for a green head handed over 61 minutes ago", async () => {
    const run = watcher({});
    expect(await run.run()).toMatchObject({ priorityRaised: 1, reviewWaits: 1, failed: [] });
    expect(await run.run()).toMatchObject({ priorityRaised: 0, failed: [] });
    expect(run.raised).toEqual([{ taskId: "task-5701", to: "high" }]);
    expect(run.wakes).toEqual([]);
  });

  test("raises a low task to high", async () => {
    const run = watcher({ held: liamHolds(5701, "low") });
    expect(await run.run()).toMatchObject({ priorityRaised: 1 });
  });

  test("leaves a medium task alone for a head handed over 59 minutes ago", async () => {
    const run = watcher({ handedAt: "2026-11-24T16:01:00Z" });
    expect(await run.run()).toMatchObject({ priorityRaised: 0 });
    expect(run.raised).toEqual([]);
  });

  test("leaves a task a person set to high or critical alone", async () => {
    for (const priority of ["high", "critical"]) {
      const run = watcher({ held: liamHolds(5701, priority) });
      expect(await run.run()).toMatchObject({ priorityRaised: 0, reviewWaits: 1 });
      expect(run.raised).toEqual([]);
    }
  });

  test("leaves it alone once the head is approved, red or in the queue", async () => {
    const quiet = [
      watcher({ extra: { approvals: [{ by: "Julian", head: "5701aaa" }] } }),
      watcher({ extra: { ciOkOnHead: "failure" } }),
      watcher({ extra: { inQueue: true } }),
    ];
    for (const run of quiet) {
      expect(await run.run()).toMatchObject({ priorityRaised: 0, longestWaits: [] });
    }
  });

  test("lists every waiting head in the pass summary, oldest handoff first", async () => {
    const run = setup({
      tasks: [liamHolds(5701), liamHolds(5702), liamHolds(5703)],
      pulls: [
        open(5701, "mateo/HAL-5701-work"),
        open(5702, "mateo/HAL-5702-work"),
        open(5703, "mateo/HAL-5703-work"),
      ],
      comments: {
        "task-5701": [handedOver(5701, "2026-11-24T15:30:00Z")],
        "task-5702": [handedOver(5702, "2026-11-24T13:00:00Z")],
        "task-5703": [handedOver(5703, "2026-11-24T16:30:00Z")],
      },
    });
    const summary = await run.run();
    expect(summary.longestWaits).toEqual([
      { task: "HAL-5702", pull: "#5702", handedAt: "2026-11-24T13:00:00Z", hours: 4 },
      { task: "HAL-5701", pull: "#5701", handedAt: "2026-11-24T15:30:00Z", hours: 1.5 },
      { task: "HAL-5703", pull: "#5703", handedAt: "2026-11-24T16:30:00Z", hours: 0.5 },
    ]);
    expect(summary.priorityRaised).toBe(2);
    expect(longestWaitingLine(summary.longestWaits)).toBe(
      "PR watcher: longest waiting for review: HAL-5702 #5702 4.0 h, HAL-5701 #5701 1.5 h, HAL-5703 #5703 0.5 h.",
    );
  });

  test("the summary line shows the top 5 and nothing when none wait", () => {
    const waits = Array.from({ length: 7 }, (_, index) => ({
      task: `HAL-${index}`,
      pull: `#${index}`,
      handedAt: `2026-11-24T1${index}:00:00Z`,
      hours: 7 - index,
    }));
    expect(longestWaitingLine(waits)?.match(/HAL-/g)).toHaveLength(5);
    expect(longestWaitingLine(waits)).toContain("HAL-0 #0 7.0 h");
    expect(longestWaitingLine([])).toBeUndefined();
  });
});
