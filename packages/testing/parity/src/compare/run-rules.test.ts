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

  it("sorts branch events by name on the new side too, when the engine starts them all first", () => {
    const test = oneRun([
      { type: "agent.started", branch: "vendor" },
      { type: "agent.started", branch: "amount" },
      { type: "llm.request", branch: "vendor" },
      { type: "llm.request", branch: "amount" },
    ]);
    expect(types(rule("parallel-branches-by-name").new?.(test))).toEqual([
      ["agent.started", "amount"],
      ["llm.request", "amount"],
      ["agent.started", "vendor"],
      ["llm.request", "vendor"],
    ]);
  });

  it("puts the fields of an old method prompt in name order and leaves other text", () => {
    const line = (fields: string) =>
      `Method "extract": Pull.\n\nAnswer with JSON with these fields: ${fields}.`;
    const test = oneRun([
      {
        type: "agent.started",
        prompt: line("vendor (string), amount (number), note (string, may be left out)"),
      },
      { type: "knowledge.searched", query: line("vendor (string), amount (number)") },
      { type: "agent.started", prompt: "Vendor: Acme Paper" },
    ]);
    expect(rule("method-fields-by-name").old?.(test).runs[0]?.events).toEqual([
      {
        type: "agent.started",
        prompt: line("amount (number), note (string, may be left out), vendor (string)"),
      },
      { type: "knowledge.searched", query: line("amount (number), vendor (string)") },
      { type: "agent.started", prompt: "Vendor: Acme Paper" },
    ]);
  });

  it("takes input tokens and cost out of the clerk's and notifier's calls only", () => {
    const response = (agent: string, inputTokens: number) => ({
      type: "llm.response",
      agent,
      usage: { inputTokens, outputTokens: 3 },
      cost: 0.1,
    });
    const test = oneRun([response("clerk", 192), response("checker", 28)], {
      id: "a",
      usage: { inputTokens: 220, outputTokens: 6 },
      cost: 0.2,
      unpricedCalls: 1,
    });
    const ruled = rule("system-message-figures").old?.(test).runs[0];
    expect(ruled?.events).toEqual([
      { type: "llm.response", agent: "clerk", usage: { outputTokens: 3 } },
      response("checker", 28),
    ]);
    expect(ruled?.summary).toEqual({ id: "a", usage: { outputTokens: 6 } });
    const without = oneRun([response("checker", 28)], {
      id: "a",
      usage: { inputTokens: 28 },
      cost: 0.1,
    });
    expect(rule("system-message-figures").new?.(without)).toEqual(without);
  });
});
