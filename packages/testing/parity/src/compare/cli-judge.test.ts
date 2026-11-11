import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { AllowedDifference } from "../allowed-differences.ts";
import type { KnownGap } from "../known-gaps.ts";
import type { CliRecording, OldCliRun } from "../recording.ts";
import { judgeCliCalls } from "./cli-judge.ts";
import { inStartOrder, type NewCliCall, pairCliCalls, type StoredRun } from "./cli-output.ts";
import { cliRule } from "./cli-rules.ts";

const at = "2026-01-01T00:00:00.000Z";

/** A run of the approval workflow that started a child run, with its version. */
function parentRun(id: string, child: string, version: string): StoredRun {
  return {
    id,
    events: [
      { type: "run.started", definitionsVersion: version, runId: id, seq: 1, at },
      { type: "workflow.started", childRunId: child, runId: id, seq: 2, at },
    ],
  };
}

function childRun(id: string): StoredRun {
  return { id, events: [{ type: "run.started", runId: id, seq: 1, at }] };
}

function oldCall(exitCode = 0, stdout = "  1 Started approval"): OldCliRun {
  return {
    name: "run",
    args: ["run", "<workspace>", "billing", "approval"],
    exitCode,
    stdout,
    stderr: "",
    runs: [parentRun("run_1", "run_2", "sha256:old"), childRun("run_2")],
    stored: ["runs/run_1.jsonl", "runs/run_2.jsonl"],
  };
}

function newCall(exitCode = 0, stdout = "Running Approval"): NewCliCall {
  return {
    name: "run",
    command: "run",
    exitCode,
    stdout,
    stderr: "",
    runs: [childRun("run_1.2"), parentRun("run_1", "run_1.2", "sha256:new")],
  };
}

function golden(...calls: OldCliRun[]): CliRecording {
  return { reference: "784f78d", case: "base", clock: at, calls };
}

function entry(id: string, cliRules: string[]): AllowedDifference {
  return {
    id,
    requirement: "cli.messages",
    area: "a",
    old: "o",
    new: "n",
    why: "w",
    status: "proposed",
    cliRules,
  };
}

const runRules = [
  entry("words", ["output-words"]),
  entry("ids", ["run-ids-by-start"]),
  entry("version", ["no-definitions-version"]),
];

function gap(calls: string[]): KnownGap {
  return { id: "json-output", task: "HAL-1", area: "a", old: "o", new: "n", calls };
}

const judge = (old: OldCliRun, fresh: NewCliCall, entries = runRules, gaps: KnownGap[] = []) =>
  judgeCliCalls(pairCliCalls(golden(old), [fresh]), entries, gaps);

verifies("parity.compare-cli-calls", () => {
  describe("verdicts", () => {
    it("allows a call equal once the output, run IDs and versions are left out", () => {
      const report = judge(oldCall(), newCall());
      expect(report.results.map((result) => result.verdict)).toEqual(["allowed"]);
      expect(report.unexplained).toEqual([]);
      expect(report.stale).toEqual([]);
    });

    it("gives a call `different` when no entry names the rule that would explain it", () => {
      const report = judge(oldCall(), newCall(), runRules.slice(0, 2));
      expect(report.unexplained.map((result) => result.call)).toEqual(["run"]);
    });

    it("compares the exit code even when the output is left out", () => {
      const report = judge(oldCall(1), newCall(0));
      expect(report.unexplained.map((result) => result.ruled.new.exitCode)).toEqual([0]);
    });

    it("gives a call a known gap names `gap`, and makes the gap stale once the call matches", () => {
      const named = judge(oldCall(1), newCall(0), runRules, [gap(["run"])]);
      expect(named.results.map((result) => [result.verdict, result.gaps])).toEqual([
        ["gap", ["json-output"]],
      ]);
      const fixed = judge(oldCall(), newCall(), runRules, [gap(["run"])]);
      expect(fixed.stale).toEqual([
        { entry: "json-output: run", reason: "the call matches now: remove it" },
      ]);
    });

    it("makes a rule stale when it changes no call", () => {
      const report = judge(oldCall(), newCall(), [
        ...runRules,
        entry("labels", ["waiting-labels-and-title"]),
      ]);
      expect(report.stale).toEqual([
        {
          entry: "labels: waiting-labels-and-title",
          reason: "the rule changes no call: remove it",
        },
      ]);
    });

    it("gives a call only one side made `different`", () => {
      const report = judgeCliCalls(pairCliCalls(golden(oldCall()), []), runRules, []);
      expect(report.unexplained.map((result) => result.new.exitCode)).toEqual([-1]);
    });
  });

  describe("pairing", () => {
    it("orders the new runs as they started: each after the run that started it", () => {
      const ordered = inStartOrder([
        childRun("run_2.4"),
        childRun("run_1.2"),
        parentRun("run_2", "run_2.4", "v"),
        parentRun("run_1", "run_1.2", "v"),
      ]);
      expect(ordered.map((run) => run.id)).toEqual(["run_1", "run_1.2", "run_2", "run_2.4"]);
    });

    it("orders runs no stored run started by their number, test_2 before test_10", () => {
      const ordered = inStartOrder([childRun("test_10"), childRun("test_2")]);
      expect(ordered.map((run) => run.id)).toEqual(["test_2", "test_10"]);
    });
  });

  describe("rules", () => {
    it("turns the new exit codes 2 and 4 to 9 into 1, and leaves 3 for an untrusted workspace", () => {
      const rule = cliRule("exit-codes-by-kind");
      const codes = [0, 1, 2, 3, 4, 9].map(
        (exitCode) =>
          rule?.new?.({ command: "run", exitCode, stdout: "", stderr: "", runs: [] }).exitCode,
      );
      expect(codes).toEqual([0, 1, 1, 3, 1, 1]);
    });

    it("takes the runs out of the old test calls only", () => {
      const rule = cliRule("test-runs-not-stored");
      const runs = [{ summary: { id: "test_1" }, events: [] }];
      const ofTest = rule?.old?.({ command: "test", exitCode: 0, stdout: "", stderr: "", runs });
      const ofRun = rule?.old?.({ command: "run", exitCode: 0, stdout: "", stderr: "", runs });
      expect([ofTest?.runs.length, ofRun?.runs.length]).toEqual([0, 1]);
    });

    it("gives the old and the new words for an answer that isn't JSON, and for its foreach item, one form", () => {
      const failed = (error: string) => ({
        command: "run",
        exitCode: 1,
        stdout: "",
        stderr: "",
        runs: [
          { summary: { id: "run_1" }, events: [{ type: "run.failed", error, reason: "error" }] },
        ],
      });
      const ruled = (id: string, side: "old" | "new", error: string) =>
        cliRule(id)?.[side]?.(failed(error)).runs[0]?.events[0]?.["error"];
      const old =
        'Item 1 of 1: Workflow "line-check" failed: Agent "checker" did not reply with valid JSON';
      const fresh =
        'Workflow "line-check" failed in item 0 of for-each state "each": Agent "checker" answered "a, b", which isn\'t the JSON its output asks for. Tighten the agent\'s instructions or use a larger model.';
      const plain = (side: "old" | "new", error: string) =>
        ruled("item-failed-words", side, String(ruled("not-json-words", side, error)));
      expect([plain("old", old), plain("new", fresh)]).toEqual([
        'item 0, workflow line-check: Agent "checker" answered no JSON',
        'item 0, workflow line-check: Agent "checker" answered no JSON',
      ]);
      expect(cliRule("run-failed-reason")?.new?.(failed("x")).runs[0]?.events[0]).toEqual({
        type: "run.failed",
        error: "x",
      });
    });
  });
});
