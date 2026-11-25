import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { ciOkOf, labelNoopCheck, labelNoopWhy, requiredWorkflowProblems } from "./checks.ts";
import { gateRow } from "./gate.ts";
import {
  actionsOf,
  ago,
  check,
  enqueued,
  entry,
  greenChecks,
  logText,
  pass,
  pull,
  snapshot,
  stateWith,
  testSettings,
} from "./merge-control.test-helper.ts";
import type { RunFact } from "./snapshot.ts";
import { emptyMergeState } from "./state.ts";

/** The rules from the merge-time report and the live Merger's changes (HAL-17909). */

function mainRun(conclusion: string, minutes: number): RunFact {
  return {
    id: minutes,
    headSha: `main${minutes}`.padEnd(40, "0"),
    status: "completed",
    conclusion,
    createdAt: ago(minutes),
    branch: "main",
  };
}

verifies("paperclip.merge-control-main-red", () => {
  test("merge-control freeze on red main", () => {
    const frozen = stateWith({
      board: { ...emptyMergeState.board, mainRed: { since: ago(60), allowRe: "HAL-2\\b" } },
    });
    const pulls = [pull(1), pull(2)];
    const red = pass(snapshot({ pulls, mainRuns: [mainRun("failure", 30)] }), frozen);
    expect(enqueued(red)).toEqual([2]);
    expect(actionsOf(red, "enqueue")[0]?.jump).toBe(true);
    expect(red.state.board.mainRed).not.toBeNull();
    const cancelled = [mainRun("success", 50), mainRun("cancelled", 10), mainRun("failure", 30)];
    const still = pass(snapshot({ pulls, mainRuns: cancelled }), frozen);
    expect(still.state.board.mainRed).not.toBeNull();
    const green = pass(snapshot({ pulls, mainRuns: [mainRun("success", 5)] }), frozen);
    expect(green.state.board.mainRed).toBeNull();
    expect(enqueued(green)).toEqual([1, 2]);
  });
});

verifies("paperclip.merge-control-behind-main", () => {
  test("no rebase request when only behind main", () => {
    const behind = pull(1, { mergeStateStatus: "BEHIND" });
    const ready = pass(snapshot({ pulls: [behind] }));
    expect(enqueued(ready)).toEqual([1]);
    expect(actionsOf(ready, "update-branch")).toEqual([]);
    const queued = pass(snapshot({ pulls: [behind], queue: [entry(1, 1)] }));
    expect(actionsOf(queued, "dequeue")).toEqual([]);
    expect(actionsOf(queued, "comment")).toEqual([]);
    const conflicting = pass(snapshot({ pulls: [pull(1, { mergeable: "CONFLICTING" })] }));
    expect(enqueued(conflicting)).toEqual([]);
  });
});

verifies("paperclip.merge-control-conflict-prediction", () => {
  test("conflict prediction only ranks", () => {
    const shared = "packages/core/shared/src/shared.ts";
    const queued = pull(1, { files: [shared] });
    const overlapping = pull(2, { files: [shared, "packages/core/two/src/two.ts"] });
    const decision = pass(
      snapshot({ pulls: [queued, overlapping, pull(3)], queue: [entry(1, 1)] }),
    );
    expect(enqueued(decision)).toEqual([3, 2]);
    expect(logText(decision)).toContain("CONFLICT_PREDICTED #2");
    expect(actionsOf(decision, "dequeue")).toEqual([]);
  });
});

verifies("paperclip.merge-control-label-noop", () => {
  test("label no-op run after CI is not ready", () => {
    const noop = (minutes: number) => check(labelNoopCheck, "CI", { runCreatedAt: ago(minutes) });
    expect(ciOkOf(pull(1)).state).toBe("success");
    expect(enqueued(pass(snapshot({ pulls: [pull(1)] })))).toEqual([1]);

    const after = pull(1, { checks: [...greenChecks(), noop(20)] });
    expect(ciOkOf(after).state).toBe("label-noop");
    const facts = snapshot({ pulls: [after] });
    expect(enqueued(pass(facts))).toEqual([]);
    expect(gateRow(facts, after, testSettings).reasons.join("\n")).toContain(labelNoopWhy);

    const reopened = check("ci-ok", "CI", { runCreatedAt: ago(10), startedAt: ago(10) });
    const before = pull(1, { checks: [...greenChecks(), noop(20), reopened] });
    expect(ciOkOf(before).state).toBe("success");
    expect(enqueued(pass(snapshot({ pulls: [before] })))).toEqual([1]);
  });
});

verifies("paperclip.merge-control-required-workflows", () => {
  test("required workflow runs in the same second all count", () => {
    const at = ago(40);
    const cancelled = check("guard", "Guard notes", { runCreatedAt: at, conclusion: "cancelled" });
    const green = check("guard", "Guard notes", { runCreatedAt: at, startedAt: ago(39) });
    const others = greenChecks().filter((each) => each.workflow !== "Guard notes");
    const both = pull(1, { checks: [...others, cancelled, green] });
    expect(requiredWorkflowProblems(both)).toEqual(["Guard notes cancelled (guard)"]);
    expect(enqueued(pass(snapshot({ pulls: [both] })))).toEqual([]);

    const rerun = { ...cancelled, conclusion: "success" };
    const fixed = pull(1, { checks: [...others, rerun, green] });
    expect(requiredWorkflowProblems(fixed)).toEqual([]);
    expect(enqueued(pass(snapshot({ pulls: [fixed] })))).toEqual([1]);

    const older = check("guard", "Guard notes", { runCreatedAt: ago(90), conclusion: "failure" });
    const newer = pull(1, { checks: [...greenChecks(), older] });
    expect(enqueued(pass(snapshot({ pulls: [newer] })))).toEqual([1]);
    expect(requiredWorkflowProblems(newer)).toEqual([]);
  });
});
