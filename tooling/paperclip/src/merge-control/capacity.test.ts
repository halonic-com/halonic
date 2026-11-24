import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  ago,
  entry,
  logText,
  pass,
  pull,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import type { RunnerCapacity } from "./snapshot.ts";

function queuedPulls(count: number, from = 100) {
  const numbers = Array.from({ length: count }, (_, index) => from + index);
  return {
    pulls: numbers.map((number) => pull(number)),
    queue: numbers.map((number, index) => entry(number, index + 1)),
  };
}

function fast(number: number) {
  return pull(number, {
    labels: ["built-on:paperclip", "fast-track"],
    fastTrackBy: "timothy-halonic",
  });
}

/** A fast-track pull request with 9 entries ahead, under this capacity. */
function jumpWith(capacity: RunnerCapacity | null) {
  const nine = queuedPulls(9);
  return pass(snapshot({ pulls: [...nine.pulls, fast(1)], queue: nine.queue, capacity }));
}

verifies("paperclip.merge-control-capacity", () => {
  test("a fast-track pull request with more than 8 ahead and no free slot gets no jump", () => {
    const decision = jumpWith({
      freeQueueSlots: 0,
      waitingByLabel: {},
      cancelledGroupsLastHour: 3,
    });
    expect(actionsOf(decision, "enqueue").map((each) => [each.number, each.jump])).toEqual([
      [1, false],
    ]);
    expect(logText(decision)).toContain("NO_JUMP #1 (no free large slot)");
  });

  test("jobs waiting for a merge-queue runner hold the jump; jobs on other labels don't", () => {
    const waiting = jumpWith({
      freeQueueSlots: 2,
      waitingByLabel: { large: 3 },
      cancelledGroupsLastHour: 0,
    });
    expect(actionsOf(waiting, "enqueue")[0]?.jump).toBe(false);
    const elsewhere = jumpWith({
      freeQueueSlots: 2,
      waitingByLabel: { small: 5 },
      cancelledGroupsLastHour: 0,
    });
    expect(actionsOf(elsewhere, "enqueue")[0]?.jump).toBe(true);
  });

  test("while main is red the fix jumps even with no free slot, and carries its cost", () => {
    const nine = queuedPulls(9);
    const decision = pass(
      snapshot({
        pulls: [...nine.pulls, pull(2)],
        queue: nine.queue,
        capacity: { freeQueueSlots: 0, waitingByLabel: {}, cancelledGroupsLastHour: 0 },
      }),
      stateWith({
        board: {
          hold: {},
          prio: {},
          fillPause: null,
          mainRed: { since: ago(60), allowRe: "HAL-2\\b" },
        },
      }),
    );
    expect(actionsOf(decision, "enqueue")).toMatchObject([
      { number: 2, jump: true, cost: { groupsCancelled: 9, runnerMinutes: 9 * 240 } },
    ]);
    expect(logText(decision)).toContain("JUMP_SHORT #2 (main red; no free large slot)");
    expect(actionsOf(jumpWith(null), "enqueue")[0]?.jump).toBe(false);
  });

  test("capacity it couldn't read counts as short", () => {
    expect(actionsOf(jumpWith(null), "enqueue")[0]?.jump).toBe(false);
    const noSlots = jumpWith({
      freeQueueSlots: null,
      waitingByLabel: {},
      cancelledGroupsLastHour: 0,
    });
    expect(actionsOf(noSlots, "enqueue")[0]?.jump).toBe(false);
    expect(logText(noSlots)).toContain("NO_JUMP #1 (capacity unknown)");
    const noWaiting = jumpWith({
      freeQueueSlots: 2,
      waitingByLabel: null,
      cancelledGroupsLastHour: 0,
    });
    expect(actionsOf(noWaiting, "enqueue")[0]?.jump).toBe(false);
  });
});

verifies("paperclip.merge-control-cost", () => {
  test("a jump carries the groups it rebuilds and their runner-minutes", () => {
    const nine = queuedPulls(9);
    const queue = nine.queue.map((each, index) =>
      index === 8 ? { ...each, groupHead: null } : each,
    );
    const decision = pass(snapshot({ pulls: [...nine.pulls, fast(1)], queue }));
    expect(actionsOf(decision, "enqueue")[0]).toMatchObject({
      jump: true,
      cost: { groupsCancelled: 8, runnerMinutes: 8 * 240 },
    });
    expect(logText(decision)).toContain("JUMPED #1 (fast-track) cancels=8 runnerMinutes=1920");
  });

  test("an enqueue at the back cancels nothing", () => {
    const decision = pass(snapshot({ pulls: [pull(1)] }));
    expect(actionsOf(decision, "enqueue")[0]?.cost).toEqual({
      groupsCancelled: 0,
      runnerMinutes: 0,
    });
  });

  test("a dequeue carries its own group and every group formed behind it", () => {
    const five = queuedPulls(5);
    const held = stateWith({
      board: { hold: { "102": "board says wait" }, prio: {}, fillPause: null, mainRed: null },
    });
    const decision = pass(snapshot(five), held);
    const [dequeue] = actionsOf(decision, "dequeue");
    expect(dequeue?.number).toBe(102);
    expect(dequeue?.cost).toEqual({ groupsCancelled: 3, runnerMinutes: 3 * 240 });
  });

  test("a pass that takes out two pull requests counts each cancelled group once", () => {
    const five = queuedPulls(5);
    const held = stateWith({
      board: { hold: { "103": "wait", "101": "wait" }, prio: {}, fillPause: null, mainRed: null },
    });
    const dequeues = actionsOf(pass(snapshot(five), held), "dequeue");
    expect(dequeues.map((each) => [each.number, each.cost.groupsCancelled])).toEqual([
      [101, 4],
      [103, 0],
    ]);
    const total = dequeues.reduce((sum, each) => sum + each.cost.runnerMinutes, 0);
    expect(total).toBe(4 * 240);
  });
});
