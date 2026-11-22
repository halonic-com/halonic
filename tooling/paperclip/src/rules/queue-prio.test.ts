import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { agingPoints, type PrioPull, type PrioTask, prioWeights, queuePrio } from "./queue-prio.ts";

const now = new Date("2026-11-22T12:00:00Z");

function hoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}

function pull(number: number, branch: string, extra: Partial<PrioPull> = {}): PrioPull {
  return { number, branch, base: "main", readySince: hoursAgo(0), ...extra };
}

function task(identifier: string, extra: Partial<PrioTask> = {}): PrioTask {
  return { identifier, status: "todo", priority: undefined, blockedBy: [], ...extra };
}

function order(ranked: readonly PrioPull[], tasks: readonly PrioTask[] = [], open = ranked) {
  return queuePrio({ ranked, open, tasks, now });
}

verifies("paperclip.queue-prio", () => {
  test("a pull request others are stacked on goes before one whose task blocks three tasks", () => {
    const base = pull(1, "ana/HAL-1-base");
    const top = pull(2, "ana/HAL-2-top", { base: "ana/HAL-1-base", readySince: undefined });
    const blocker = pull(3, "bo/HAL-3-blocker");
    const tasks = [
      task("HAL-10", { blockedBy: ["HAL-3"] }),
      task("HAL-11", { blockedBy: ["HAL-3"] }),
      task("HAL-12", { blockedBy: ["hal-3"] }),
    ];

    const ranked = order([base, blocker], tasks, [base, top, blocker]);

    expect(ranked.map((entry) => [entry.number, entry.score])).toEqual([
      [1, 100],
      [3, 30],
    ]);
    expect(ranked[0]?.parts.stackedPulls).toBe(100);
    expect(ranked[1]?.parts.blockedTasks).toBe(30);
  });

  test("only open tasks count as blocked, and each task once", () => {
    const tasks = [
      task("HAL-10", { status: "done", blockedBy: ["HAL-3"] }),
      task("HAL-11", { status: "cancelled", blockedBy: ["HAL-3"] }),
      task("HAL-12", { status: "in_progress", blockedBy: ["HAL-3", "HAL-3"] }),
    ];

    const [entry] = order([pull(3, "bo/HAL-3-blocker")], tasks);

    expect(entry?.parts.blockedTasks).toBe(10);
  });

  test("the pull request's own task priority adds its number", () => {
    const tasks = [
      task("HAL-1", { priority: "critical" }),
      task("HAL-2", { priority: "high" }),
      task("HAL-3", { priority: "medium" }),
      task("HAL-4", { priority: "low" }),
    ];
    const pulls = [1, 2, 3, 4, 5].map((n) => pull(n, `ana/HAL-${n}-x`));

    const scores = order(pulls, tasks).map((entry) => [entry.number, entry.parts.taskPriority]);

    expect(scores).toEqual([
      [1, 4],
      [2, 3],
      [3, 2],
      [4, 1],
      [5, 0],
    ]);
  });

  test("aging adds 1 per full 2 hours ready, at most 24", () => {
    expect(agingPoints(hoursAgo(7), now)).toBe(3);
    expect(agingPoints(hoursAgo(1.99), now)).toBe(0);
    expect(agingPoints(hoursAgo(48), now)).toBe(24);
    expect(agingPoints(hoursAgo(100), now)).toBe(24);
  });

  test("aging lets an old pull request pass a newer one with a higher task priority", () => {
    const tasks = [task("HAL-1", { priority: "critical" }), task("HAL-2", { priority: "low" })];
    const fresh = pull(1, "ana/HAL-1-fresh", { readySince: hoursAgo(1) });
    const old = pull(2, "bo/HAL-2-old", { readySince: hoursAgo(9) });

    expect(order([fresh, old], tasks).map((entry) => [entry.number, entry.score])).toEqual([
      [2, 5],
      [1, 4],
    ]);
  });

  test("equal scores go oldest ready first, then lowest number", () => {
    const pulls = [
      pull(9, "ana/HAL-9-a", { readySince: hoursAgo(0.5) }),
      pull(8, "ana/HAL-8-b", { readySince: hoursAgo(1) }),
      pull(7, "ana/HAL-7-c", { readySince: hoursAgo(0.5) }),
      pull(6, "ana/HAL-6-d", { readySince: undefined }),
      pull(5, "ana/HAL-5-e", { readySince: undefined }),
    ];

    expect(order(pulls).map((entry) => entry.number)).toEqual([8, 7, 9, 5, 6]);
  });
});

describe("queue.prio edges", () => {
  test("a branch without a task id scores only what it can", () => {
    const [entry] = order([pull(1, "dependabot-update", { readySince: hoursAgo(4) })]);

    expect(entry).toMatchObject({ task: undefined, score: 2 });
  });

  test("a pull request doesn't count itself as stacked on itself", () => {
    const odd = pull(1, "ana/HAL-1-x", { base: "ana/HAL-1-x" });

    expect(order([odd])[0]?.parts.stackedPulls).toBe(0);
  });

  test("a ready time in the future or unreadable adds no aging", () => {
    expect(agingPoints(hoursAgo(-3), now)).toBe(0);
    expect(agingPoints("not a time", now)).toBe(0);
    expect(agingPoints(undefined, now)).toBe(0);
  });

  test("other weights can be passed in", () => {
    const weights = { ...prioWeights, perBlockedTask: 1 };
    const tasks = [task("HAL-10", { blockedBy: ["HAL-3"] })];
    const ready = [pull(3, "bo/HAL-3-x")];

    const [entry] = queuePrio({ ranked: ready, open: ready, tasks, now, weights });

    expect(entry?.score).toBe(1);
  });
});
