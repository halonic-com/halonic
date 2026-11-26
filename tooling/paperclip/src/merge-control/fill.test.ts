import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  ago,
  boardLogin,
  enqueued,
  entry,
  logText,
  pass,
  pull,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import { emptyMergeState } from "./state.ts";

function queuedPulls(count: number, from = 100) {
  const numbers = Array.from({ length: count }, (_, index) => from + index);
  return {
    pulls: numbers.map((number) => pull(number)),
    queue: numbers.map((number, index) => entry(number, index + 1)),
  };
}

function fast(number: number, by: string | null = boardLogin) {
  return pull(number, { labels: ["built-on:paperclip", "fast-track"], fastTrackBy: by });
}

verifies("paperclip.merge-control-fill-order", () => {
  test("a pull request others are stacked on, or whose task blocks tasks, goes first", () => {
    const plain = pull(1);
    const blocker = pull(2);
    const base = pull(3);
    const facts = snapshot({
      pulls: [plain, blocker, base],
      open: [
        ...[plain, blocker, base].map(({ number, branch, base: on, head }) => ({
          number,
          branch,
          base: on,
          head,
        })),
        { number: 4, branch: "mateo/HAL-4-top", base: base.branch, head: "f".repeat(40) },
      ],
      tasks: [{ identifier: "HAL-9", status: "blocked", priority: "high", blockedBy: ["HAL-2"] }],
    });
    expect(enqueued(pass(facts))).toEqual([3, 2, 1]);
  });

  test("the board's boost adds to the score; equal scores go oldest first", () => {
    const state = stateWith({ board: { ...emptyMergeState.board, prio: { "2": 5 } } });
    expect(enqueued(pass(snapshot({ pulls: [pull(1), pull(2)] }), state))).toEqual([2, 1]);
    expect(enqueued(pass(snapshot({ pulls: [pull(2), pull(1)] })))).toEqual([1, 2]);
  });

  test("it fills up to 15, or the lower target while runners are short", () => {
    const busy = queuedPulls(13);
    const facts = snapshot({
      pulls: [...busy.pulls, pull(1), pull(2), pull(3)],
      queue: busy.queue,
    });
    expect(enqueued(pass(facts))).toEqual([1, 2]);
    expect(enqueued(pass(facts, stateWith({ fillTarget: 12 })))).toEqual([]);
  });

  test("it remembers when each candidate first passed the gate", () => {
    const decision = pass(
      snapshot({ pulls: [pull(1, { mergeable: "UNKNOWN" }), pull(2)], queue: [entry(2, 1)] }),
      stateWith({ readySince: { "1": ago(30) } }),
    );
    expect(decision.state.readySince).toEqual({});
  });
});

verifies("paperclip.merge-control-fast-track", () => {
  test("a fast-track label from a verified labeller goes first; any other is queued normally and logged", () => {
    const decision = pass(
      snapshot({ pulls: [pull(1), fast(2), fast(3, "someone"), fast(4, null)] }),
    );
    expect(enqueued(decision)).toEqual([2, 1, 3, 4]);
    expect(logText(decision)).toContain("FAST_UNVERIFIED #3(someone) #4(?)");
    // The shared account every agent posts as never fast-tracks (2.3 of HAL-19228).
    const shared = pass(snapshot({ pulls: [pull(1), fast(5, "halonic-dev")] }));
    expect(enqueued(shared)).toEqual([1, 5]);
    expect(logText(shared)).toContain("FAST_UNVERIFIED #5(halonic-dev)");
  });

  test("a board boost above 50,000 doesn't put a normal pull request ahead of a fast-track one", () => {
    const state = stateWith({ board: { ...emptyMergeState.board, prio: { "1": 60_000 } } });
    expect(enqueued(pass(snapshot({ pulls: [pull(1), fast(2)] }), state))).toEqual([2, 1]);
  });

  test("every ready fast-track pull request goes in during one pass, past the target", () => {
    const full = queuedPulls(15);
    const decision = pass(
      snapshot({ pulls: [...full.pulls, fast(1), fast(2), pull(3)], queue: full.queue }),
    );
    expect(enqueued(decision)).toEqual([1, 2]);
  });

  test("it jumps only with more than 8 entries queued, and only the first while none is queued", () => {
    const nine = queuedPulls(9);
    const decision = pass(
      snapshot({ pulls: [...nine.pulls, fast(1), fast(2)], queue: nine.queue }),
    );
    expect(actionsOf(decision, "enqueue").map((each) => [each.number, each.jump])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(logText(decision)).toContain("JUMPED #1 (fast-track)");
    const eight = queuedPulls(8);
    expect(
      actionsOf(
        pass(snapshot({ pulls: [...eight.pulls, fast(1)], queue: eight.queue })),
        "enqueue",
      )[0]?.jump,
    ).toBe(false);
  });

  test("with a fast-track pull request already queued nothing jumps, and a queued one is never taken out to jump", () => {
    const nine = queuedPulls(9);
    const queuedFast = fast(50);
    const facts = snapshot({
      pulls: [...nine.pulls, queuedFast, fast(1)],
      queue: [...nine.queue, entry(50, 10)],
    });
    const decision = pass(facts);
    expect(actionsOf(decision, "enqueue").map((each) => [each.number, each.jump])).toEqual([
      [1, false],
    ]);
    expect(actionsOf(decision, "dequeue")).toEqual([]);
  });
});
