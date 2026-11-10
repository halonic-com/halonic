import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunEvent, RunEventBase, RunEventBody } from "./run-event.ts";
import { entryOf } from "./timeline-entry.ts";

type Step = RunEventBody & Partial<Pick<RunEventBase, "branch" | "item" | "entry">>;

/** A run log of these events, numbered from seq 1. */
function log(...steps: Step[]): RunEvent[] {
  return steps.map((step, index) => ({
    runId: "r",
    seq: index + 1,
    at: "2026-11-08T08:00:00Z",
    ...step,
  }));
}

const started: Step = {
  type: "run.started",
  hubId: "acme",
  workflowId: "greet",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};
const usage = { inputTokens: 1, outputTokens: 1 };
const resume = { messages: [], calls: [], step: 0 };

function agentStarted(agent: string, parent?: string): Step {
  return { type: "agent.started", state: "s", agent, prompt: "hi", ...(parent ? { parent } : {}) };
}
function agentFinished(agent: string, parent?: string): Step {
  return { type: "agent.finished", state: "s", agent, output: null, ...(parent ? { parent } : {}) };
}
function toolCalled(tool: string): Step {
  return { type: "tool.called", agent: "w", tool, args: {} };
}
function toolResult(tool: string): Step {
  return { type: "tool.result", agent: "w", tool, result: "ok" };
}

verifies("events.timeline-entry-id", () => {
  it("updates the run.started entry when the run completes or fails", () => {
    const completed: Step = { type: "run.completed", state: "done", context: {} };
    const failed: Step = { type: "run.failed", state: null, error: "boom" };
    expect(entryOf(log(started, completed))).toEqual([1, 1]);
    expect(entryOf(log(started, failed))).toEqual([1, 1]);
  });

  it("updates a state.entered entry with the transition out of that state", () => {
    const events = log(
      { type: "state.entered", state: "a" },
      { type: "state.entered", state: "b" },
      { type: "transition", from: "a", to: "c", event: "next" },
    );
    expect(entryOf(events)).toEqual([1, 2, 1]);
  });

  it("matches agent.finished on state, agent and parent", () => {
    const events = log(
      agentStarted("w"),
      agentStarted("x", "w"),
      agentFinished("x", "w"),
      agentFinished("w"),
    );
    expect(entryOf(events)).toEqual([1, 2, 2, 1]);
  });

  it("updates an llm.request entry with its fallback and its response", () => {
    const events = log(
      { type: "llm.request", agent: "w", provider: "p", model: "m1", messages: 1 },
      { type: "llm.fallback", agent: "w", from: "m1", to: "m2", error: "busy" },
      {
        type: "llm.response",
        agent: "w",
        provider: "p",
        model: "m2",
        usage,
        latencyMs: 5,
        text: "ok",
      },
    );
    expect(entryOf(events)).toEqual([1, 1, 1]);
  });

  it("matches tool.result on agent and tool", () => {
    const events = log(
      toolCalled("search"),
      toolCalled("fetch"),
      toolResult("fetch"),
      toolResult("search"),
    );
    expect(entryOf(events)).toEqual([1, 2, 2, 1]);
  });

  it("matches approval.resolved on callId", () => {
    const request = (callId: string): Step => ({
      type: "approval.requested",
      state: "s",
      agent: "w",
      tool: "send",
      args: {},
      callId,
      resume,
    });
    const resolved = (callId: string): Step => ({
      type: "approval.resolved",
      state: "s",
      agent: "w",
      tool: "send",
      callId,
      approved: true,
    });
    const events = log(request("c1"), request("c2"), resolved("c2"), resolved("c1"));
    expect(entryOf(events)).toEqual([1, 2, 2, 1]);
  });

  it("matches workflow.finished on childRunId", () => {
    const begin = (childRunId: string): Step => ({
      type: "workflow.started",
      state: "s",
      workflow: "child",
      childRunId,
    });
    const end = (childRunId: string): Step => ({
      type: "workflow.finished",
      state: "s",
      workflow: "child",
      childRunId,
      status: "completed",
    });
    expect(entryOf(log(begin("k1"), begin("k2"), end("k2"), end("k1")))).toEqual([1, 2, 2, 1]);
  });

  it("updates a run.waiting entry with the event that ends the wait", () => {
    const waiting: Step = { type: "run.waiting", state: "s", events: ["approve"] };
    const fired: Step = { type: "timer.fired", state: "s", after: "1h" };
    const received: Step = { type: "event.received", event: "approve" };
    expect(entryOf(log(waiting, fired))).toEqual([1, 1]);
    expect(entryOf(log(waiting, received))).toEqual([1, 1]);
    // The wait is over, so the next event stands alone.
    expect(entryOf(log(waiting, received, received))).toEqual([1, 1, 3]);
  });

  it("gives an event.received while the run isn't waiting its own entry", () => {
    expect(entryOf(log(started, { type: "event.received", event: "ping" }))).toEqual([1, 2]);
  });

  it("gives the events that are never updated their own entry", () => {
    const events = log(
      { type: "knowledge.searched", agent: "w", source: "docs", query: "q", refs: [] },
      {
        type: "artifact.created",
        state: "s",
        name: "a.txt",
        hash: "h",
        mediaType: "text/plain",
        size: 1,
      },
      { type: "context.updated", key: "k", value: 1 },
      { type: "signal.sent", state: "s", name: "go", data: {} },
      {
        type: "llm.skipped",
        agent: "w",
        alias: "smart",
        provider: "p",
        model: "m1",
        reason: "no-key",
        next: "default",
      },
    );
    expect(entryOf(events)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the entries of parallel branches apart", () => {
    const events = log(
      { ...agentStarted("w"), branch: "left" },
      { ...agentStarted("w"), branch: "right" },
      { ...agentFinished("w"), branch: "right" },
      { ...agentFinished("w"), branch: "left" },
    );
    expect(entryOf(events)).toEqual([1, 2, 2, 1]);
  });

  it("keeps the entries of for-each items apart", () => {
    const events = log(
      { ...toolCalled("fetch"), item: 0 },
      { ...toolCalled("fetch"), item: 1 },
      { ...toolResult("fetch"), item: 1 },
      { ...toolResult("fetch"), item: 0 },
    );
    expect(entryOf(events)).toEqual([1, 2, 2, 1]);
  });

  it("updates the latest still-open entry when a state is entered again", () => {
    const events = log(
      { type: "state.entered", state: "a" },
      { type: "transition", from: "a", to: "a", event: "again" },
      { type: "state.entered", state: "a" },
      { type: "transition", from: "a", to: "b", event: "next" },
    );
    expect(entryOf(events)).toEqual([1, 1, 3, 3]);
  });

  it("gives an old log the same entries as the log the engine writes", () => {
    const old = log(
      started,
      agentStarted("w"),
      toolCalled("search"),
      toolResult("search"),
      agentFinished("w"),
    );
    const written = log(
      { ...started, entry: 1 },
      { ...agentStarted("w"), entry: 2 },
      { ...toolCalled("search"), entry: 3 },
      { ...toolResult("search"), entry: 3 },
      { ...agentFinished("w"), entry: 2 },
    );
    expect(entryOf(old)).toEqual([1, 2, 3, 3, 2]);
    expect(entryOf(written)).toEqual(entryOf(old));
  });

  it("keeps an event's own entry", () => {
    const events = log(
      agentStarted("w"),
      agentStarted("w"),
      { ...agentFinished("w"), entry: 1 },
      agentFinished("w"),
    );
    expect(entryOf(events)).toEqual([1, 2, 1, 2]);
  });
});

verifies("events.started-events", () => {
  it("gives sandbox.started and harness.started an entry of their own", () => {
    const sandbox = {
      strength: "os" as const,
      workingFolder: "~/acme/files/agents/w",
      readOnlyPaths: [],
      deniedGroups: [],
      deniedPaths: [],
      allowedSites: [],
      timeLimitMs: 600_000,
    };
    const events = log(
      { type: "sandbox.started", state: "s", agent: "w", timeoutMs: 30_000 },
      { type: "sandbox.opened", state: "s", agent: "w", sandbox },
      {
        type: "harness.started",
        state: "s",
        agent: "w",
        harness: "claude-code",
        timeoutMs: 60_000,
      },
    );
    expect(entryOf(events)).toEqual([1, 2, 3]);
  });
});

verifies("events.sandbox-blocked", () => {
  it("gives each sandbox.blocked event an entry of its own, also for the same target", () => {
    const block = { kind: "network", host: "api.example.com", port: 443 } as const;
    const events = log(
      { type: "sandbox.blocked", state: "s", agent: "w", block, count: 1 },
      { type: "sandbox.blocked", state: "s", agent: "w", block, count: 7 },
    );
    expect(entryOf(events)).toEqual([1, 2]);
  });
});
