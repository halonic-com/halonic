import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { groupPull } from "./culprit.ts";
import {
  actionsOf,
  ago,
  enqueued,
  entry,
  headOf,
  logText,
  pass,
  pull,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import type { GroupRun } from "./snapshot.ts";

function group(number: number, changes: Partial<GroupRun> = {}): GroupRun {
  return {
    id: 7000 + number,
    conclusion: "failure",
    branch: `gh-readonly-queue/main/pr-${number}-${headOf(number)}`,
    url: `https://github.com/acme/tools/actions/runs/${7000 + number}`,
    createdAt: ago(20),
    failedJobs: [
      {
        id: 1,
        name: "Test (core)",
        url: "https://github.com/acme/tools/job/1",
        failedSteps: ["Run tests"],
      },
    ],
    ...changes,
  };
}

verifies("paperclip.merge-control-culprit-hold", () => {
  test("the group's pull request, once out of the queue, is held on its head and told once", () => {
    const facts = snapshot({ pulls: [pull(5)], groupRuns: [group(5)] });
    const first = pass(facts);
    expect(enqueued(first)).toEqual([]);
    expect(first.state.failedHeads).toEqual({ "5": headOf(5) });
    expect(actionsOf(first, "comment").map((each) => each.body)).toEqual([
      "Queue manager: this PR was taken out of the merge queue because its merge group failed in `Test (core)`: https://github.com/acme/tools/actions/runs/7005\nIt will not be queued again until it has a new head. If the failure is not from this PR's code, say so on this PR and push a rebase.",
    ]);
    const second = pass(facts, first.state);
    expect(enqueued(second)).toEqual([]);
    expect(actionsOf(second, "comment")).toEqual([]);
    expect(logText(second)).toContain(
      "#5(failed in a merge group on this head; waits for a new head)",
    );
  });

  test("a new head lifts the hold", () => {
    const state = stateWith({ failedHeads: { "5": headOf(5) } });
    const pushed = pull(5, { head: headOf(5, 1) });
    expect(enqueued(pass(snapshot({ pulls: [pushed] }), state))).toEqual([5]);
  });

  test("while GitHub still has it queued, a cancelled group whose only failed job ci-ok doesn't need is looked at again next pass", () => {
    const watcher = {
      id: 3,
      name: "Cancel the run on the first failure",
      url: "https://github.com/acme/tools/job/3",
      failedSteps: ["Watch the other jobs"],
    };
    const decision = pass(
      snapshot({
        pulls: [pull(5)],
        queue: [entry(5, 1)],
        groupRuns: [group(5, { conclusion: "cancelled", failedJobs: [watcher] })],
      }),
    );
    expect(decision.state.failedHeads).toEqual({});
    expect(decision.state.seenFailedRuns).toEqual([]);
    expect(logText(decision)).toContain("culprit #5(still queued)");
  });

  test("a hold lifted by hand for a flake keeps it in", () => {
    const state = stateWith({ flakeLifted: { "5": headOf(5) } });
    const decision = pass(snapshot({ pulls: [pull(5)], groupRuns: [group(5)] }), state);
    expect(enqueued(decision)).toEqual([5]);
    expect(logText(decision)).toContain("(flake, hold lifted)");
  });

  test("a cancelled group with no failed job lets its pull request back once; the second one holds it", () => {
    const cancelled = group(5, { conclusion: "cancelled", failedJobs: [] });
    const first = pass(snapshot({ pulls: [pull(5)], groupRuns: [cancelled] }));
    expect(enqueued(first)).toEqual([5]);
    expect(first.state.autoFlaked).toEqual({ "5": headOf(5) });
    const again = pass(snapshot({ pulls: [pull(5)], groupRuns: [{ ...cancelled, id: 8000 }] }), {
      ...first.state,
      flakeLifted: {},
    });
    expect(enqueued(again)).toEqual([]);
    expect(again.state.failedHeads).toEqual({ "5": headOf(5) });
  });

  test("a cancelled group that hides a failed job holds like a failure; old or seen groups are left alone", () => {
    const hidden = group(5, { conclusion: "cancelled" });
    expect(pass(snapshot({ pulls: [pull(5)], groupRuns: [hidden] })).state.failedHeads).toEqual({
      "5": headOf(5),
    });
    const old = group(5, { createdAt: ago(90) });
    expect(pass(snapshot({ pulls: [pull(5)], groupRuns: [old] })).state.failedHeads).toEqual({});
    const seen = stateWith({ seenFailedRuns: [7005] });
    expect(
      pass(snapshot({ pulls: [pull(5)], groupRuns: [group(5)] }), seen).state.failedHeads,
    ).toEqual({});
  });

  test("a failed group whose pull request isn't open is logged and seen", () => {
    const decision = pass(snapshot({ groupRuns: [group(5)] }));
    expect(decision.state.seenFailedRuns).toEqual([7005]);
    expect(logText(decision)).toContain(
      "failed group https://github.com/acme/tools/actions/runs/7005 [Test (core)]",
    );
    expect(groupPull("gh-readonly-queue/main/pr-5719-abc")).toBe(5719);
  });
});

verifies("paperclip.pr-watcher-held", () => {
  test("a hold keeps its run, failed jobs and error line for the PR watcher, until a new head", () => {
    const annotated = group(5, {
      failedJobs: [
        {
          id: 1,
          name: "Test (core)",
          url: "https://github.com/acme/tools/job/1",
          failedSteps: ["Run tests"],
          annotationTitles: ["Process completed with exit code 1.", "Expected 3, received 4"],
        },
      ],
    });
    const held = pass(snapshot({ pulls: [pull(5)], groupRuns: [annotated] }));
    expect(held.state.heldRuns).toEqual({
      "5": {
        head: headOf(5),
        url: "https://github.com/acme/tools/actions/runs/7005",
        jobs: ["Test (core)"],
        error: "Expected 3, received 4",
      },
    });
    const pushed = pass(snapshot({ pulls: [pull(5, { head: headOf(5, 1) })] }), held.state);
    expect(pushed.state.heldRuns).toEqual({});
  });

  test("a run whose annotations say only an exit code has no error line", () => {
    const plain = pass(snapshot({ pulls: [pull(5)], groupRuns: [group(5)] }));
    expect(plain.state.heldRuns["5"]?.error).toBeNull();
  });
});
