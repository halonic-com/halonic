import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { ago, entry, headOf, pass, pull, snapshot } from "./merge-control.test-helper.ts";
import { queueFirst } from "./order.ts";
import type { MergeAction } from "./state.ts";

const noCost = { groupsCancelled: 0, runnerMinutes: 0 };

function enqueue(number: number): MergeAction {
  return {
    kind: "enqueue",
    number,
    pullId: `PR_${number}`,
    head: headOf(number),
    jump: false,
    cost: noCost,
  };
}

function dequeue(number: number): MergeAction {
  return {
    kind: "dequeue",
    number,
    pullId: `PR_${number}`,
    head: headOf(number),
    reason: "conflict",
    comment: "conflicts with main: please rebase",
    cost: noCost,
  };
}

function comment(number: number): MergeAction {
  return { kind: "comment", number, key: `note#${number}`, body: `note ${number}` };
}

verifies("paperclip.merge-control-queue-first", () => {
  test("a pass sends its removal, then its enqueue, then the culprit's comment", () => {
    const failedGroup = {
      id: 7005,
      conclusion: "failure" as const,
      branch: `gh-readonly-queue/main/pr-5-${headOf(5)}`,
      url: "https://github.com/acme/tools/actions/runs/7005",
      createdAt: ago(20),
      failedJobs: [
        {
          id: 1,
          name: "Test (core)",
          url: "https://github.com/acme/tools/job/1",
          failedSteps: ["Run tests"],
        },
      ],
    };
    const facts = snapshot({
      pulls: [pull(1, { mergeable: "CONFLICTING" }), pull(5), pull(6)],
      queue: [entry(1, 1)],
      groupRuns: [failedGroup],
    });
    const kinds = pass(facts).actions.map((action) =>
      action.kind === "wake"
        ? `wake ${action.task}`
        : `${action.kind}#${"number" in action ? action.number : "-"}`,
    );
    // The authors' wakes (HAL-17907) come after the queue writes too.
    expect(kinds).toEqual(["dequeue#1", "enqueue#6", "wake HAL-1", "comment#5", "wake HAL-5"]);
  });

  test("dequeues go first and enqueues second, each kind keeping its order", () => {
    const rerun: MergeAction = { kind: "rerun", runId: 42, why: "cancelled ci-ok" };
    const cancel: MergeAction = { kind: "cancel-run", runId: 43, why: "stale" };
    const mixed = [
      comment(1),
      enqueue(3),
      rerun,
      dequeue(9),
      enqueue(2),
      cancel,
      dequeue(4),
      comment(5),
    ];
    expect(queueFirst(mixed)).toEqual([
      dequeue(9),
      dequeue(4),
      enqueue(3),
      enqueue(2),
      comment(1),
      rerun,
      cancel,
      comment(5),
    ]);
    expect(queueFirst([])).toEqual([]);
  });
});
