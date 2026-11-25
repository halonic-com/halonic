import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { ActResult } from "./act.ts";
import { keepSent } from "./retry.ts";
import { emptyMergeState, type MergeAction, type MergeState } from "./state.ts";

const before: MergeState = {
  ...emptyMergeState,
  noted: { "removed#5": "old" },
  reran: { "4": { head: "h4-old", at: "2026-11-24T10:00:00.000Z", run: 40 } },
  unmergeableSince: { "6": "2026-11-24T11:00:00.000Z" },
};

const decided: MergeState = {
  ...before,
  lastQueue: [1, 7],
  noted: { "removed#5": "h5", "ready#8": "h8" },
  reran: { "4": { head: "h4", at: "2026-11-24T12:00:00.000Z", run: 41 } },
  reranFlake: { "9": { head: "h9", at: "2026-11-24T12:00:00.000Z", run: 90 } },
  unmergeableSince: {},
  cooldown: { "6": { head: "h6", ahead: [1], at: "2026-11-24T12:00:00.000Z" } },
};

const actions: MergeAction[] = [
  { kind: "comment", number: 5, key: "removed#5@h5", body: "Taken out." },
  { kind: "comment", number: 8, key: "ready#8@h8", body: "Ready." },
  { kind: "rerun", runId: 41, why: "#4 ci-ok cancelled" },
  { kind: "rerun-failed-jobs", runId: 90, why: "#9 runner/setup error" },
  {
    kind: "dequeue",
    number: 6,
    pullId: "PR_6",
    head: "h6",
    reason: "unmergeable",
    comment: "Taken out.",
    cost: { groupsCancelled: 0, runnerMinutes: 0 },
  },
  {
    kind: "enqueue",
    number: 7,
    pullId: "PR_7",
    head: "h7",
    jump: false,
    cost: { groupsCancelled: 0, runnerMinutes: 0 },
  },
] as MergeAction[];

const outcomes = (outcome: ActResult["outcome"]): ActResult[] =>
  actions.map((_, index) => ({ action: String(index), outcome }));

verifies("paperclip.merge-control-failed-writes", () => {
  test("every failed action's entries go back to the state before the pass", () => {
    const kept = keepSent(before, decided, actions, outcomes("failed"));
    expect(kept.noted).toEqual({ "removed#5": "old" });
    expect(kept.reran).toEqual(before.reran);
    expect(kept.reranFlake).toEqual({});
    expect(kept.unmergeableSince).toEqual(before.unmergeableSince);
    expect(kept.lastQueue).toEqual([1]);
    // The cooldown counts only once the entry is out, so it stays.
    expect(kept.cooldown).toEqual(decided.cooldown);
  });

  test("sent and shadow actions keep what the pass decided", () => {
    expect(keepSent(before, decided, actions, outcomes("sent"))).toEqual(decided);
    expect(keepSent(before, decided, actions, outcomes("shadow"))).toEqual(decided);
  });

  test("only the failed one is undone", () => {
    const results = outcomes("sent").map((result, index) =>
      index === 1 ? { ...result, outcome: "failed" as const } : result,
    );
    expect(keepSent(before, decided, actions, results).noted).toEqual({ "removed#5": "h5" });
  });
});
