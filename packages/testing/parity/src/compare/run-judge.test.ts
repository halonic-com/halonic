import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { AllowedDifference } from "../allowed-differences.ts";
import type { KnownGap } from "../known-gaps.ts";
import type { OldTestRun, RunLogs } from "../recording.ts";
import { judgeRunLogs } from "./run-judge.ts";
import { pairRunLogs } from "./run-logs.ts";

const at = "2026-01-01T00:00:00.000Z";

/** A one-run test of the approval workflow, with the run's version and the clerk's answer. */
function test(version: string, answer = "ok", name = "approve"): OldTestRun {
  return {
    hub: "billing",
    workflow: "approval",
    name,
    passed: true,
    failures: [],
    runId: "test_1",
    runs: [
      {
        id: "test_1",
        summary: { id: "test_1", status: "completed", definitionsVersion: version },
        events: [
          { type: "run.started", definitionsVersion: version, runId: "test_1", seq: 1, at },
          { type: "agent.finished", output: answer, runId: "test_1", seq: 2, at },
        ],
      },
    ],
  };
}

function golden(...tests: OldTestRun[]): RunLogs {
  return { reference: "784f78d", case: "base", clock: at, tests };
}

function entry(runRules: string[]): AllowedDifference {
  return {
    id: "definitions-version",
    requirement: "workspace.definitions",
    area: "a",
    old: "o",
    new: "n",
    why: "w",
    status: "proposed",
    runRules,
  };
}

function gap(tests: string[]): KnownGap {
  return { id: "json-output", task: "HAL-1", area: "a", old: "o", new: "n", tests };
}

const name = "billing/approval/approve";

verifies("parity.compare-run-logs", () => {
  describe("verdicts", () => {
    it("gives the same test `same`", () => {
      const report = judgeRunLogs(pairRunLogs(golden(test("v1")), [test("v1")]), [], []);
      expect(report.results.map((result) => result.verdict)).toEqual(["same"]);
      expect(report.unexplained).toEqual([]);
    });

    it("allows a test equal once an entry's rule is applied", () => {
      const report = judgeRunLogs(
        pairRunLogs(golden(test("sha256:old")), [test("new-hash")]),
        [entry(["no-definitions-version"])],
        [],
      );
      expect(report.results.map((result) => result.verdict)).toEqual(["allowed"]);
      expect(report.stale).toEqual([]);
    });

    it("finds the same test different when no entry names the rule", () => {
      const report = judgeRunLogs(pairRunLogs(golden(test("sha256:old")), [test("new")]), [], []);
      expect(report.unexplained.map((result) => result.test)).toEqual([name]);
    });

    it("calls a test a known gap names a gap, not a difference", () => {
      const report = judgeRunLogs(
        pairRunLogs(golden(test("v1", '{"ok":true}')), [test("v1", "text")]),
        [],
        [gap([name])],
      );
      expect(report.results.map((result) => [result.verdict, result.gaps])).toEqual([
        ["gap", ["json-output"]],
      ]);
      expect(report.unexplained).toEqual([]);
    });

    it("finds a test only one side ran different", () => {
      const report = judgeRunLogs(
        pairRunLogs(golden(test("v1")), [test("v1"), test("v1", "ok", "reject")]),
        [],
        [],
      );
      expect(report.unexplained.map((result) => result.test)).toEqual(["billing/approval/reject"]);
    });
  });

  describe("stale entries", () => {
    it("finds a rule that changes no test stale", () => {
      const report = judgeRunLogs(
        pairRunLogs(golden(test("v1")), [test("v1")]),
        [entry(["no-definitions-version", "foreach-items-in-order"])],
        [],
      );
      expect(report.stale).toEqual([
        {
          entry: "definitions-version: foreach-items-in-order",
          reason: "the rule changes no test: remove it",
        },
      ]);
    });

    it("finds a gap whose test matches now stale", () => {
      const report = judgeRunLogs(pairRunLogs(golden(test("v1")), [test("v1")]), [], [gap([name])]);
      expect(report.stale).toEqual([
        { entry: `json-output: ${name}`, reason: "the test matches now: remove it" },
      ]);
    });

    it("finds a gap that names a test the fixture doesn't have stale", () => {
      const report = judgeRunLogs(
        pairRunLogs(golden(test("v1")), [test("v1")]),
        [],
        [gap(["billing/approval/nothing"])],
      );
      expect(report.stale.map((stale) => stale.reason)).toEqual(["no such test"]);
    });
  });
});
