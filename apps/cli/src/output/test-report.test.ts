import type { DefinitionSource } from "@halonicjs/ports";
import type { TestFailure, TestResult, TestSuiteResult } from "@halonicjs/test-runner";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { beforeAll, describe, expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { testJson, testLines } from "./test-report.ts";

const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/billing/hub.yaml": "id: billing\nname: Billing\n",
  "hubs/billing/workflows/approval.workflow.yaml": [
    "id: approval",
    "name: Approval",
    "initial: decide",
    "states:",
    "  decide: { type: wait, description: Decide on the invoice, on: [{ to: paid, event: approve }] }",
    "  paid: { type: final }",
    "",
  ].join("\n"),
};

const source: DefinitionSource = {
  location: "memory:test-report",
  list: async () => Object.keys(files),
  read: async (path) => files[path] ?? null,
  version: async () => "v1",
};

let loaded: LoadedWorkspace;

beforeAll(async () => {
  loaded = await loadWorkspace(source);
  expect(loaded.issues).toEqual([]);
});

/** Why a step couldn't be tried; the sentence doesn't use it. */
const leftOut = { kind: "invalid-without-change", path: "x", message: "m" } as const;

/** One test of the approval workflow, failed when it has failures. */
function failedWith(...failures: TestFailure[]): TestSuiteResult {
  const passed = failures.length === 0;
  const test: TestResult = {
    hub: "billing",
    workflow: "approval",
    name: "approve",
    file: "hubs/billing/workflows/approval.test.yaml",
    line: 3,
    passed,
    durationMs: 250,
    failures,
    runId: "test_1",
    runs: [],
  };
  return { tests: [test], passed: passed ? 1 : 0, failed: passed ? 0 : 1, durationMs: 250 };
}

/** The sentences under the failed test, as `--json` gives them. */
function sentences(...failures: TestFailure[]): string[] {
  return testJson(failedWith(...failures), loaded).cases[0]?.failures.map((f) => f.message) ?? [];
}

verifies("cli.commands.test.run-tests", () => {
  describe("a failed test's sentences", () => {
    it("names steps as the live lines do, and an unknown one in quotes", () => {
      expect(sentences({ kind: "final", expected: "paid", actual: "decide" })).toEqual([
        "Expected the run to end in the step Paid, but it ended in Decide on the invoice.",
      ]);
      expect(
        sentences({ kind: "states", expected: ["decide", "payd"], actual: ["decide"] }),
      ).toEqual([
        `Expected the run to go through Decide on the invoice and "payd", but it went through Decide on the invoice.`,
      ]);
    });

    it("says how the run ended, with its step when it has one", () => {
      expect(
        sentences(
          { kind: "status", expected: "completed", actual: "waiting", step: "decide" },
          { kind: "status", expected: "waiting", actual: "failed" },
          { kind: "status", expected: "failed", actual: "cant-try" },
          { kind: "status", expected: "completed", actual: "running" },
        ),
      ).toEqual([
        "Expected the run to finish, but it's waiting for an answer in the step Decide on the invoice.",
        "Expected the run to wait for an answer, but it failed.",
        "Expected the run to fail, but it couldn't try everything.",
        "Expected the run to finish, but it was still running.",
      ]);
    });

    it("words the runner's other failures", () => {
      expect(
        sentences(
          { kind: "context", path: "invoice.paid", expected: true, set: false },
          { kind: "artifacts", expected: "receipt.md", saved: [] },
          { kind: "unscripted-tool", tool: "files.read_file" },
          { kind: "unscripted-program", step: "decide", agent: "coder" },
          { kind: "unused-replies", agent: "writer", count: 2 },
          { kind: "unused-tool-results", tool: "files.read_file", count: 1 },
          { kind: "unused-program-results", agent: "coder", count: 2 },
          { kind: "event-not-delivered", event: "approve", status: "completed" },
          {
            kind: "cant-try",
            steps: [{ status: "cant-try", item: "x", step: "decide", reason: leftOut }],
          },
          {
            kind: "cant-try",
            steps: [{ status: "cant-try", item: "x", step: null, reason: leftOut }],
          },
          { kind: "error", message: "The model said no.\u001b[2J" },
        ),
      ).toEqual([
        "Expected invoice.paid to be true when the run ended, but it wasn't set.",
        "Expected the run to save receipt.md, but it saved no files.",
        "The run called the tool files.read_file, and the test has no result for it. Script its result in the test file.",
        "The step Decide on the invoice would start a program, and tests never start programs. Script its result in the test file.",
        "The test scripted 2 replies for the agent writer that the run never asked for.",
        "The test scripted 1 result for the tool files.read_file that the run never used.",
        "The test scripted 2 program results for the agent coder that the run never used.",
        "The run didn't take the event approve, because it had finished.",
        "The run couldn't try Decide on the invoice: they need changes you haven't accepted yet.",
        "The run couldn't try this workflow: it needs changes you haven't accepted yet.",
        "The run failed: The model said no.\\u001b[2J",
      ]);
    });

    it("gives each failure the test file with / and the case's line in --json", () => {
      const json = testJson(
        failedWith({ kind: "unscripted-tool", tool: "files.read_file" }),
        loaded,
      );

      expect(json.cases[0]?.failures[0]).toMatchObject({
        file: "hubs/billing/workflows/approval.test.yaml",
        line: 3,
      });
      expect(json.cases[0]).toMatchObject({ status: "failed", durationMs: 250 });
    });
  });

  it("puts a blank line before the summary when every test passed", () => {
    const lines = testLines(failedWith(), { workspace: "acme", loaded }).map(plainText);

    expect(lines.slice(1)).toEqual([
      "",
      "✓ approval › approve   0.3 s",
      "",
      "✓ 1 test passed in 0.3 s.",
    ]);
  });
});
