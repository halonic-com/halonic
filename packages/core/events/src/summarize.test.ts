import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunEvent, RunEventBody } from "./run-event.ts";
import { summarize } from "./summarize.ts";

const startedAt = "2026-11-05T07:00:00.000Z";
const started: RunEventBody = {
  type: "run.started",
  hubId: "p",
  workflowId: "f",
  input: { q: "hi" },
  kind: "run",
  definitionsVersion: "v1",
};

/** A run log of run "r": `run.started` first, then the given bodies, numbered from 2. */
function runLog(...bodies: RunEventBody[]): RunEvent[] {
  return [started, ...bodies].map((body, index) => ({
    runId: "r",
    seq: index + 1,
    at: index === 0 ? startedAt : `T${index + 1}`,
    ...body,
  }));
}

function summaryOf(...bodies: RunEventBody[]) {
  const summary = summarize(runLog(...bodies));
  if (summary === null) throw new Error("expected a summary");
  return summary;
}

verifies("events.summary-start", () => {
  it("is null for an empty stream", () => {
    expect(summarize([])).toBeNull();
  });

  it("is null when the stream doesn't start with run.started", () => {
    expect(
      summarize([{ runId: "r", seq: 1, at: startedAt, type: "state.entered", state: "s" }]),
    ).toBeNull();
  });

  it("takes the run's facts from run.started", () => {
    const trigger = { type: "schedule" as const, routineId: "p/daily", at: startedAt };
    const parent = { runId: "p1", state: "s", depth: 1 };
    const log: RunEvent[] = [{ runId: "r", seq: 1, at: startedAt, ...started, trigger, parent }];
    expect(summarize(log)).toEqual({
      id: "r",
      hubId: "p",
      workflowId: "f",
      kind: "run",
      status: "running",
      state: null,
      startedAt,
      endedAt: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      cost: 0,
      unpricedCalls: 0,
      statesVisited: [],
      context: {},
      error: null,
      definitionsVersion: "v1",
      trigger,
      parentRunId: "p1",
      waitingOn: null,
      accepts: [],
      nextTimer: null,
      approval: null,
      signals: [],
      lastSeq: 1,
      updatedAt: startedAt,
    });
  });

  it("has no trigger and no parent run when run.started names none", () => {
    expect(summaryOf()).toMatchObject({ trigger: null, parentRunId: null });
  });
});

verifies("events.summary-progress", () => {
  it("tracks the current state and every state visited", () => {
    const summary = summaryOf(
      { type: "state.entered", state: "a" },
      { type: "state.entered", state: "b" },
      { type: "state.entered", state: "a" },
    );
    expect(summary.state).toBe("a");
    expect(summary.statesVisited).toEqual(["a", "b", "a"]);
  });

  it("keeps the last value of each context key", () => {
    const summary = summaryOf(
      { type: "context.updated", key: "x", value: 1 },
      { type: "context.updated", key: "x", value: 2 },
    );
    expect(summary.context).toEqual({ x: 2 });
  });

  it("ends completed with the final context", () => {
    const summary = summaryOf(
      { type: "context.updated", key: "x", value: 1 },
      { type: "run.completed", state: "end", context: { done: true } },
    );
    expect(summary).toMatchObject({
      status: "completed",
      endedAt: "T3",
      context: { done: true },
      error: null,
    });
  });

  it("ends failed with the error", () => {
    const summary = summaryOf({ type: "run.failed", state: null, error: "boom" });
    expect(summary).toMatchObject({ status: "failed", endedAt: "T2", error: "boom" });
  });
});

verifies("events.summary-last-event", () => {
  it("names the last event's sequence number and time", () => {
    const summary = summaryOf(
      { type: "state.entered", state: "a" },
      { type: "state.entered", state: "b" },
    );
    expect(summary).toMatchObject({ lastSeq: 3, updatedAt: "T3" });
  });

  it("moves on with events that change nothing else", () => {
    const summary = summaryOf({ type: "transition", from: "a", to: "b", event: "next" });
    expect(summary).toMatchObject({ lastSeq: 2, updatedAt: "T2" });
  });
});

verifies("events.summary-cost", () => {
  const response = {
    type: "llm.response",
    agent: "a",
    provider: "p",
    model: "m",
    latencyMs: 1,
    text: "",
  } as const;

  it("adds up tokens and the cost of priced calls", () => {
    const summary = summaryOf(
      { ...response, usage: { inputTokens: 10, outputTokens: 5 }, cost: 0.25 },
      { ...response, usage: { inputTokens: 20, outputTokens: 7 }, cost: 0.5 },
    );
    expect(summary.usage).toEqual({ inputTokens: 30, outputTokens: 12 });
    expect(summary.cost).toBe(0.75);
    expect(summary.unpricedCalls).toBe(0);
  });

  it("counts calls without a cost as unpriced, and a zero cost as priced", () => {
    const summary = summaryOf(
      { ...response, usage: { inputTokens: 1, outputTokens: 1 } },
      { ...response, usage: { inputTokens: 1, outputTokens: 1 }, cost: 0 },
    );
    expect(summary.cost).toBe(0);
    expect(summary.unpricedCalls).toBe(1);
  });
});

verifies("events.summary-waiting", () => {
  const waiting: RunEventBody = {
    type: "run.waiting",
    state: "w",
    events: ["approve", "reject"],
    child: "c1",
    timers: [
      { after: "2h", at: "2026-11-05T09:00:00.000Z" },
      { after: "1h", at: "2026-11-05T08:00:00.000Z" },
    ],
  };

  it("says what the run waits for and when its earliest timer is due", () => {
    expect(summaryOf(waiting)).toMatchObject({
      status: "waiting",
      accepts: ["approve", "reject"],
      waitingOn: "c1",
      nextTimer: "2026-11-05T08:00:00.000Z",
    });
  });

  it("has no next timer and no child when the wait has neither", () => {
    expect(summaryOf({ type: "run.waiting", state: "w", events: ["go"] })).toMatchObject({
      waitingOn: null,
      nextTimer: null,
    });
    expect(
      summaryOf({ type: "run.waiting", state: "w", events: [], timers: [] }).nextTimer,
    ).toBeNull();
  });

  const wakeUps: RunEventBody[] = [
    { type: "timer.fired", state: "w", after: "1h" },
    { type: "event.received", event: "approve" },
    {
      type: "workflow.finished",
      state: "w",
      workflow: "child",
      childRunId: "c1",
      status: "completed",
    },
  ];
  for (const wakeUp of wakeUps) {
    it(`runs again and clears the wait after ${wakeUp.type}`, () => {
      expect(summaryOf(waiting, wakeUp)).toMatchObject({
        status: "running",
        accepts: [],
        waitingOn: null,
        nextTimer: null,
      });
    });
  }

  it("runs again when a new state is entered", () => {
    expect(summaryOf(waiting, { type: "state.entered", state: "next" }).status).toBe("running");
  });

  it("stays done when a state is entered after the end", () => {
    const summary = summaryOf(
      { type: "run.failed", state: null, error: "x" },
      { type: "state.entered", state: "s" },
    );
    expect(summary.status).toBe("failed");
  });
});

verifies("events.summary-approvals-and-signals", () => {
  const requested: RunEventBody = {
    type: "approval.requested",
    state: "s",
    agent: "a",
    tool: "send",
    args: { to: "x" },
    callId: "c1",
    resume: { messages: [], calls: [], step: 0 },
  };

  it("shows the tool call waiting for approval", () => {
    expect(summaryOf(requested).approval).toEqual({
      agent: "a",
      tool: "send",
      args: { to: "x" },
      callId: "c1",
    });
  });

  it("clears the approval once it is resolved", () => {
    const resolved: RunEventBody = {
      type: "approval.resolved",
      state: "s",
      agent: "a",
      tool: "send",
      callId: "c1",
      approved: true,
    };
    expect(summaryOf(requested, resolved).approval).toBeNull();
  });

  it("lists the signals in order, each with its run and sequence number", () => {
    const summary = summaryOf(
      { type: "state.entered", state: "s" },
      { type: "signal.sent", state: "s", name: "first", data: { n: 1 } },
      { type: "signal.sent", state: "s", name: "done", data: {} },
    );
    expect(summary.signals).toEqual([
      { id: "r:3", name: "first", data: { n: 1 }, at: "T3" },
      { id: "r:4", name: "done", data: {}, at: "T4" },
    ]);
  });

  it("ignores events that don't change the summary, apart from the last event", () => {
    const quiet = summaryOf({ type: "transition", from: "a", to: "b", event: "next" });
    expect({ ...quiet, lastSeq: 1, updatedAt: startedAt }).toEqual(summaryOf());
  });
});
