import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvalAt, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { recentRuns } from "./recent-runs.ts";
import { runRow } from "./run-row.ts";

function rowOf(id: string, changes: Partial<RunSummary>) {
  const workflow = { name: "Support reply", stepDescription: () => undefined };
  return runRow(
    { summary: summaryWith({ id, ...changes }), madeToolCalls: false },
    { workflow, routine: undefined, currency: "EUR", now: mondayMorning },
  );
}

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

verifies("runs.home", () => {
  it("shows the latest five, with running and needs-you runs above finished ones", () => {
    const finished = ["f1", "f2", "f3", "f4", "f5", "f6"].map((id) =>
      rowOf(id, { status: "completed" }),
    );
    const running = rowOf("running", {});
    const needsYou = rowOf("needs", { approvals: [approvalAt(1)] });
    expect(ids(recentRuns([...finished, running, needsYou]))).toEqual([
      "running",
      "needs",
      "f1",
      "f2",
      "f3",
    ]);
  });

  it("leaves out a finished test run and keeps a live one", () => {
    const finishedTest = rowOf("test-done", { kind: "test", status: "completed" });
    const liveTest = rowOf("test-live", { kind: "test" });
    const done = rowOf("done", { status: "completed" });
    expect(ids(recentRuns([finishedTest, done, liveTest]))).toEqual(["test-live", "done"]);
  });

  it("shows nothing without runs", () => {
    expect(recentRuns([])).toEqual([]);
  });
});
