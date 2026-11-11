import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { summarize } from "./summarize.ts";
import { parseEventLine } from "./upgrade.ts";

// An invented run log in the shape written before `tool.result.outcome`,
// `run.failed.reason` and `approval.resolved.by` existed (HAL-1525). It must
// keep reading exactly as it did then.
const lines = readFileSync(
  fileURLToPath(new URL("./fixtures/old-run-log.jsonl", import.meta.url)),
  "utf8",
)
  .split("\n")
  .filter((line) => line !== "");

verifies("events.upgrade-old-run-logs", () => {
  it("reads every event of a log written before the engine's fields unchanged", () => {
    for (const line of lines) {
      expect(parseEventLine(line), line).toStrictEqual(JSON.parse(line));
    }
  });

  it("adds no model fallback fields to a log written before them", () => {
    const events = lines.map(parseEventLine);
    const response = events.find((event) => event.type === "llm.response");
    const failed = events.find((event) => event.type === "run.failed");
    expect(response).toBeDefined();
    expect(response).not.toHaveProperty("toolCallAsText");
    expect(failed).not.toHaveProperty("reason");
    expect(events.some((event) => event.type === "llm.skipped")).toBe(false);
  });

  it("adds no risk, noun or verb to a tool result written before them", () => {
    const results = lines.map(parseEventLine).filter((event) => event.type === "tool.result");
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result).not.toHaveProperty("risk");
      expect(result).not.toHaveProperty("noun");
      expect(result).not.toHaveProperty("verb");
    }
  });

  it("adds no blob to a tool result written before it", () => {
    const results = lines.map(parseEventLine).filter((event) => event.type === "tool.result");
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result).not.toHaveProperty("resultBlob");
    }
  });

  it("summarizes a log written before the engine's fields as before", () => {
    expect(summarize(lines.map(parseEventLine))).toStrictEqual({
      id: "r-acme",
      hubId: "acme",
      workflowId: "pay-invoice",
      kind: "run",
      status: "failed",
      state: "pay",
      startedAt: "2026-11-05T07:00:00.000Z",
      endedAt: "2026-11-05T08:00:02.000Z",
      usage: { inputTokens: 120, outputTokens: 30 },
      cost: 0.01,
      unpricedCalls: 0,
      subscriptionCalls: 0,
      statesVisited: ["pay"],
      context: {},
      error: "the bank is offline",
      reason: null,
      definitionsVersion: "v1",
      trigger: null,
      parentRunId: null,
      waitingOn: null,
      accepts: [],
      answerLabels: {},
      nextTimer: null,
      waitingFor: null,
      lastWaitingAt: "2026-11-05T07:00:05.000Z",
      approvals: [],
      signals: [],
      cantTry: [],
      lastSeq: 14,
      updatedAt: "2026-11-05T08:00:02.000Z",
    });
  });

  it("lists the one waiting approval of a log written before approvals became a list", () => {
    const waitingPart = lines.slice(0, 9).map(parseEventLine);
    expect(summarize(waitingPart)?.approvals).toStrictEqual([
      {
        agent: "payer",
        tool: "pay",
        args: { amount: 40 },
        callId: "call_1",
        at: "2026-11-05T07:00:05.000Z",
        state: "pay",
        branch: null,
        item: null,
      },
    ]);
  });
});
