import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ComparedTest, LogEvent } from "./run-logs.ts";
import { type RunRule, runRule } from "./run-rules.ts";

function rule(id: string): RunRule {
  const found = runRule(id);
  if (found === undefined) throw new Error(`no rule ${id}`);
  return found;
}

function oneRun(events: LogEvent[], summary: Record<string, unknown> = { id: "a" }): ComparedTest {
  return { passed: true, failures: 0, runs: [{ summary, events }] };
}

const types = (test: ComparedTest | undefined) =>
  test?.runs[0]?.events.map((event) => [
    event["type"],
    event["item"] ?? event["branch"] ?? event["key"],
  ]);

verifies("parity.compare-run-logs", () => {
  it("names runs run_1, run_2 in start order, wherever their IDs appear", () => {
    const test: ComparedTest = {
      passed: true,
      failures: 0,
      runs: [
        {
          summary: { id: "test_1" },
          events: [{ type: "workflow.started", childRunId: "test_1.23" }],
        },
        { summary: { id: "test_1.23", parentRunId: "test_1" }, events: [] },
      ],
    };
    expect(rule("run-ids-by-start").new?.(test)).toEqual({
      passed: true,
      failures: 0,
      runs: [
        { summary: { id: "run_1" }, events: [{ type: "workflow.started", childRunId: "run_2" }] },
        { summary: { id: "run_2", parentRunId: "run_1" }, events: [] },
      ],
    });
  });

  it("sorts a stretch of foreach item events by item and numbers the log again", () => {
    const test = oneRun([
      { type: "state.entered", seq: 1 },
      { type: "workflow.started", item: 0, seq: 2 },
      { type: "workflow.started", item: 1, seq: 3 },
      { type: "workflow.finished", item: 0, seq: 4 },
      { type: "workflow.started", item: 2, seq: 5 },
      { type: "workflow.finished", item: 1, seq: 6 },
      { type: "context.updated", key: "results", seq: 7 },
    ]);
    const sorted = rule("foreach-items-in-order").new?.(test);
    expect(types(sorted)).toEqual([
      ["state.entered", undefined],
      ["workflow.started", 0],
      ["workflow.finished", 0],
      ["workflow.started", 1],
      ["workflow.finished", 1],
      ["workflow.started", 2],
      ["context.updated", "results"],
    ]);
    expect(sorted?.runs[0]?.events.map((event) => event["seq"])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("sorts the old parallel branch events and the context they wrote by branch name", () => {
    const test = oneRun([
      { type: "agent.started", branch: "vendor" },
      { type: "agent.started", branch: "amount" },
      { type: "context.updated", key: "vendor" },
      { type: "context.updated", key: "amount" },
      { type: "context.updated", key: "checks" },
    ]);
    expect(types(rule("parallel-branches-by-name").old?.(test))).toEqual([
      ["agent.started", "amount"],
      ["agent.started", "vendor"],
      ["context.updated", "amount"],
      ["context.updated", "vendor"],
      ["context.updated", "checks"],
    ]);
  });

  it("takes only the named fields out", () => {
    const waiting = oneRun([
      { type: "run.waiting", state: "decide", labels: {}, title: "Approve?" },
    ]);
    expect(rule("waiting-labels-and-title").new?.(waiting).runs[0]?.events).toEqual([
      { type: "run.waiting", state: "decide" },
    ]);
    const finished = oneRun([{ type: "workflow.finished", status: "completed", context: {} }]);
    expect(rule("child-context-in-finished").new?.(finished).runs[0]?.events).toEqual([
      { type: "workflow.finished", status: "completed" },
    ]);
    const summaries = oneRun([], { id: "a", approval: null, approvals: [], lastSeq: 3 });
    expect(rule("summary-new-fields").old?.(summaries).runs[0]?.summary).toEqual({
      id: "a",
      approvals: [],
      lastSeq: 3,
    });
    expect(rule("summary-new-fields").new?.(summaries).runs[0]?.summary).toEqual({
      id: "a",
      approval: null,
    });
  });
});
