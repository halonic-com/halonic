import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  ago,
  enqueued,
  headOf,
  logText,
  pass,
  pull,
  snapshot,
} from "./merge-control.test-helper.ts";
import { cancelledText, groupCounts, hookRefusedTitle, refusedOnly } from "./refused.ts";
import type { FailedJob, GroupRun } from "./snapshot.ts";

function job(id: number, name: string, annotationTitles?: readonly string[]): FailedJob {
  return {
    id,
    name,
    url: `https://github.com/acme/tools/job/${id}`,
    failedSteps: [],
    ...(annotationTitles === undefined ? {} : { annotationTitles }),
  };
}

const refused = (id: number, name: string): FailedJob => job(id, name, [hookRefusedTitle]);

function group(failedJobs: readonly FailedJob[], changes: Partial<GroupRun> = {}): GroupRun {
  return {
    id: 7005,
    conclusion: "failure",
    branch: `gh-readonly-queue/main/pr-5-${headOf(5)}`,
    url: "https://github.com/acme/tools/actions/runs/7005",
    createdAt: ago(20),
    failedJobs,
    ...changes,
  };
}

/** One pass over pull request 5, out of the queue, with `run` as its failed group. */
function passOver(run: GroupRun) {
  return pass(snapshot({ pulls: [pull(5)], groupRuns: [run] }));
}

function expectHeld(run: GroupRun): void {
  const decision = passOver(run);
  expect(enqueued(decision)).toEqual([]);
  expect(decision.state.failedHeads).toEqual({ "5": headOf(5) });
  expect(logText(decision)).not.toContain("runner hook refused");
}

verifies("paperclip.merge-control-hook-refused", () => {
  test("counts a hook-refused merge group as cancelled, not failed", () => {
    const run = group([
      refused(1, "Test (core)"),
      refused(2, "Lint"),
      job(3, "ci-ok", ["Process completed with exit code 1."]),
    ]);
    expect(refusedOnly(run)).toBe(true);
    const decision = passOver(run);
    expect(enqueued(decision)).toEqual([5]);
    expect(decision.state.failedHeads).toEqual({});
    expect(decision.state.autoFlaked).toEqual({});
    expect(decision.state.flakeLifted).toEqual({});
    expect(decision.state.mainBroken).toBeNull();
    expect(decision.state.board.mainRed).toBeNull();
    expect(actionsOf(decision, "comment")).toEqual([]);
    expect(decision.state.seenFailedRuns).toEqual([7005]);
    expect(logText(decision)).toContain(
      "culprit #5(runner hook refused a rebuilt group's jobs; not a failure)",
    );

    const failedGroup = group([job(4, "Test (core)", ["Test failed"])], { id: 7006 });
    const cancelledGroup = group([], { id: 7007, conclusion: "cancelled" });
    const counts = groupCounts([run, failedGroup, cancelledGroup]);
    expect(counts).toEqual({ failed: 1, cancelled: 2, hookRefused: 1 });
    expect(cancelledText(counts)).toBe("cancelled 2 (hook-refused 1)");
  });

  test("keeps culprit handling when a refused job sits next to a real test failure", () => {
    const run = group([
      refused(1, "Lint"),
      job(2, "Test (studio)", ["runs-view > shows the newest run first"]),
    ]);
    expect(refusedOnly(run)).toBe(false);
    expect(groupCounts([run])).toEqual({ failed: 1, cancelled: 0, hookRefused: 0 });
    expectHeld(run);
  });

  test("keeps culprit handling for a failed job without annotations", () => {
    const run = group([refused(1, "Lint"), job(2, "Test (core)", [])]);
    expect(refusedOnly(run)).toBe(false);
    expectHeld(run);
  });

  test("never skips the hold handling when the refused check is unavailable", () => {
    // The reader couldn't read the annotations, so the titles are missing on every job.
    const unread = group([job(1, "Test (core)"), job(2, "Lint")]);
    expect(refusedOnly(unread)).toBe(false);
    expectHeld(unread);
    expect(refusedOnly(group([job(3, "ci-ok", [hookRefusedTitle])]))).toBe(false);
  });
});
