import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { ciOkOf, liveCloudOf, requiredWorkflowProblems } from "./checks.ts";
import {
  actionsOf,
  ago,
  check,
  enqueued,
  greenChecks,
  logText,
  pass,
  pull,
  snapshot,
} from "./merge-control.test-helper.ts";

verifies("paperclip.merge-control-ci-ok", () => {
  test("the newest ci-ok run decides, by run creation before start", () => {
    const older = check("ci-ok", "CI", {
      runCreatedAt: ago(90),
      startedAt: ago(5),
      conclusion: "success",
    });
    const newer = check("ci-ok", "CI", {
      runCreatedAt: ago(40),
      startedAt: ago(40),
      conclusion: "cancelled",
    });
    const decision = pass(
      snapshot({ pulls: [pull(1, { checks: [...greenChecks().slice(1), older, newer] })] }),
    );
    expect(enqueued(decision)).toEqual([]);
    expect(ciOkOf(pull(1, { checks: [older, newer] })).state).toBe("cancelled");
  });

  test("while a CI job on the head runs it is pending, and a merge-group ci-ok doesn't count", () => {
    const running = check("Build", "CI", { status: "in_progress", conclusion: null });
    expect(ciOkOf(pull(1, { checks: [...greenChecks(), running] })).state).toBe("pending");
    const group = check("ci-ok", "CI", { event: "merge_group" });
    expect(ciOkOf(pull(1, { checks: [group] })).state).toBe("missing");
    const rerun = check("ci-ok", "CI", {
      status: "queued",
      conclusion: null,
      startedAt: null,
      runCreatedAt: ago(90),
    });
    expect(ciOkOf(pull(1, { checks: [check("ci-ok", "CI"), rerun] })).state).toBe("pending");
  });
});

verifies("paperclip.merge-control-required-workflows", () => {
  test("Guard notes and Built-on label must pass on the head after the last retarget", () => {
    const retargeted = pull(1, { retargetedAt: [ago(20)] });
    expect(requiredWorkflowProblems(retargeted)).toEqual([
      "Guard notes has not run",
      "Built-on label has not run",
    ]);
    expect(enqueued(pass(snapshot({ pulls: [retargeted] })))).toEqual([]);
  });

  test("only the newest run of each counts, and a pending one waits", () => {
    const red = check("label", "Built-on label", { conclusion: "failure", runCreatedAt: ago(80) });
    expect(requiredWorkflowProblems(pull(1, { checks: [...greenChecks(), red] }))).toEqual([]);
    const pending = check("guard", "Guard notes", {
      status: "in_progress",
      conclusion: null,
      runCreatedAt: ago(5),
    });
    expect(requiredWorkflowProblems(pull(1, { checks: [...greenChecks(), pending] }))).toEqual([
      "Guard notes pending",
    ]);
    const failed = check("guard", "Guard notes", { conclusion: "failure", runCreatedAt: ago(5) });
    expect(requiredWorkflowProblems(pull(1, { checks: [...greenChecks(), failed] }))).toEqual([
      "Guard notes failure (guard)",
    ]);
  });
});

verifies("paperclip.merge-control-live-cloud", () => {
  test("a pending live-cloud check holds the pull request, with one note per head", () => {
    const pending = [
      check("live-cloud", "Live cloud", { status: "in_progress", conclusion: null }),
    ];
    const facts = snapshot({ pulls: [pull(1, { liveCloud: pending })] });
    const first = pass(facts);
    expect(enqueued(first)).toEqual([]);
    expect(actionsOf(first, "comment").map((each) => each.body)).toEqual([
      "Waiting for the live cloud suites to pass on this head (`live-cloud` check).",
    ]);
    expect(actionsOf(pass(facts, first.state), "comment")).toEqual([]);
    expect(logText(first)).toContain("live-cloud in_progress");
  });

  test("a pass, a newest skipped run or no run lets it in; an unreadable list waits", () => {
    const passed = [
      check("live-cloud", "Live cloud", { conclusion: "failure", startedAt: ago(1) }),
      check("live-cloud", "Live cloud"),
    ];
    expect(liveCloudOf(pull(1, { liveCloud: passed })).ok).toBe(true);
    expect(
      liveCloudOf(
        pull(1, { liveCloud: [check("live-cloud", "Live cloud", { conclusion: "skipped" })] }),
      ).ok,
    ).toBe(true);
    expect(liveCloudOf(pull(1, { liveCloud: [] })).ok).toBe(true);
    expect(liveCloudOf(pull(1, { liveCloud: null }))).toEqual({
      ok: false,
      why: "live-cloud: could not read checks",
    });
  });
});
