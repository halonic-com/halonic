import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
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
      subscriptionCalls: 0,
      statesVisited: [],
      context: {},
      error: null,
      reason: null,
      definitionsVersion: "v1",
      trigger,
      parentRunId: "p1",
      waitingOn: null,
      accepts: [],
      nextTimer: null,
      waitingFor: null,
      lastWaitingAt: null,
      approvals: [],
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

  it("takes the reason from run.failed", () => {
    const summary = summaryOf({ type: "run.failed", state: null, error: "boom", reason: "budget" });
    expect(summary.reason).toBe("budget");
  });

  it("has no reason while the run hasn't failed", () => {
    expect(summaryOf({ type: "state.entered", state: "a" }).reason).toBeNull();
    expect(summaryOf({ type: "run.completed", state: "end", context: {} }).reason).toBeNull();
  });

  it("has no reason when run.failed gives none, as in older logs", () => {
    const summary = summaryOf({ type: "run.failed", state: null, error: "boom" });
    expect(summary.reason).toBeNull();
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

  it("adds up cache tokens apart from the input tokens", () => {
    const summary = summaryOf(
      {
        ...response,
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 900 },
        cost: 0.25,
      },
      {
        ...response,
        usage: { inputTokens: 20, outputTokens: 7, cacheWriteTokens: 300 },
        cost: 0.5,
      },
      { ...response, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 100 }, cost: 0 },
    );
    expect(summary.usage).toEqual({
      inputTokens: 31,
      outputTokens: 13,
      cacheReadTokens: 1_000,
      cacheWriteTokens: 300,
    });
  });

  it("adds up 1-hour cache writes apart from 5-minute ones", () => {
    const summary = summaryOf(
      {
        ...response,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheWriteTokens: 300,
          cacheWrite1hTokens: 2_000,
        },
        cost: 0.25,
      },
      { ...response, usage: { inputTokens: 1, outputTokens: 1, cacheWrite1hTokens: 500 }, cost: 0 },
    );
    expect(summary.usage).toEqual({
      inputTokens: 11,
      outputTokens: 6,
      cacheWriteTokens: 300,
      cacheWrite1hTokens: 2_500,
    });
  });

  typeTest("marks a subscription call, and is absent otherwise", () => {
    type Response = Extract<RunEventBody, { type: "llm.response" }>;
    expectTypeOf<Response["paidBy"]>().toEqualTypeOf<"subscription" | undefined>();
  });

  it("counts subscription calls on their own, with their tokens but never their cost", () => {
    const usage = { inputTokens: 1_000, outputTokens: 200 };
    const summary = summaryOf(
      { ...response, usage, cost: 0, paidBy: "subscription" },
      { ...response, usage, paidBy: "subscription" },
      { ...response, usage, cost: 0.006 },
      { ...response, usage },
      { ...response, usage, cost: 0 },
    );
    expect(summary).toMatchObject({
      usage: { inputTokens: 5_000, outputTokens: 1_000 },
      cost: 0.006,
      unpricedCalls: 1,
      subscriptionCalls: 2,
    });
  });

  it("leaves a subscription call out of the cost whatever its cost", () => {
    const usage = { inputTokens: 1, outputTokens: 1 };
    const summary = summaryOf(
      { ...response, usage, cost: 0.25 },
      { ...response, usage, cost: 0.5, paidBy: "subscription" },
    );
    expect(summary).toMatchObject({ cost: 0.25, unpricedCalls: 0, subscriptionCalls: 1 });
  });
});

verifies("events.waiting-description", () => {
  const waiting = (fields: { title?: string; body?: string }): RunEventBody => ({
    type: "run.waiting",
    state: "review",
    events: ["approve", "reject"],
    ...fields,
  });

  it("holds the filled-in title and body while the run waits", () => {
    expect(
      summaryOf(waiting({ title: "Approve this reply?", body: "Hello Ada" })).waitingFor,
    ).toEqual({
      title: "Approve this reply?",
      body: "Hello Ada",
    });
    expect(summaryOf(waiting({ title: "Approve this reply?" })).waitingFor).toEqual({
      title: "Approve this reply?",
      body: "",
    });
  });

  it("is null for a wait without a description, as in older logs", () => {
    expect(summaryOf(waiting({})).waitingFor).toBeNull();
  });

  it("is null again once the run goes on", () => {
    const summary = summaryOf(waiting({ title: "Approve this reply?" }), {
      type: "event.received",
      event: "approve",
    });
    expect(summary.waitingFor).toBeNull();
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

  it("keeps the time of the last run.waiting after the run goes on", () => {
    const summary = summaryOf(
      waiting,
      { type: "event.received", event: "approve" },
      { type: "run.waiting", state: "w2", events: ["go"] },
      { type: "event.received", event: "go" },
    );
    expect(summary).toMatchObject({ status: "running", lastWaitingAt: "T4" });
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

  const resolved: RunEventBody = {
    type: "approval.resolved",
    state: "s",
    agent: "a",
    tool: "send",
    callId: "c1",
    approved: true,
  };

  it("lists the tool call waiting for approval, with when and where it was asked", () => {
    expect(summaryOf(requested).approvals).toEqual([
      {
        agent: "a",
        tool: "send",
        args: { to: "x" },
        callId: "c1",
        at: "T2",
        state: "s",
        branch: null,
        item: null,
      },
    ]);
  });

  it("removes the approval once it is resolved", () => {
    expect(summaryOf(requested, resolved).approvals).toEqual([]);
  });

  it("lists one approval per parallel branch and removes only the resolved one", () => {
    const log: RunEvent[] = [
      ...runLog(),
      { runId: "r", seq: 2, at: "T2", branch: "left", ...requested, callId: "c1" },
      { runId: "r", seq: 3, at: "T3", branch: "right", ...requested, callId: "c2" },
      { runId: "r", seq: 4, at: "T4", item: 1, ...requested, callId: "c3" },
      { runId: "r", seq: 5, at: "T5", branch: "right", ...resolved, callId: "c2" },
    ];
    const approvals = summarize(log)?.approvals ?? [];
    const where = approvals.map(({ callId, branch, item, at }) => ({ callId, branch, item, at }));
    expect(where).toEqual([
      { callId: "c1", branch: "left", item: null, at: "T2" },
      { callId: "c3", branch: null, item: 1, at: "T4" },
    ]);
  });

  it("leaves the approvals alone when a resolved call id isn't waiting", () => {
    expect(summaryOf(requested, { ...resolved, callId: "other" }).approvals).toHaveLength(1);
  });

  it("lists no approvals once a run cancelled while it waited has ended", () => {
    const cancelled: RunEventBody = {
      type: "run.failed",
      state: "s",
      error: "Cancelled.",
      reason: "cancelled",
    };
    const summary = summaryOf(
      requested,
      { type: "run.waiting", state: "s", events: ["approve", "reject"] },
      cancelled,
    );
    expect(summary.approvals).toEqual([]);
    expect(summary.reason).toBe("cancelled");
  });

  it("lists no approvals once a budget stop ends a run with two items waiting", () => {
    const log: RunEvent[] = [
      ...runLog(),
      { runId: "r", seq: 2, at: "T2", item: 0, ...requested, callId: "c1" },
      { runId: "r", seq: 3, at: "T3", item: 1, ...requested, callId: "c2" },
      {
        runId: "r",
        seq: 4,
        at: "T4",
        type: "run.failed",
        state: "s",
        error: "The run budget is used up.",
        reason: "budget",
      },
    ];
    expect(summarize(log)?.approvals).toEqual([]);
  });

  it("lists no approvals once a run has completed", () => {
    expect(
      summaryOf(requested, { type: "run.completed", state: "s", context: {} }).approvals,
    ).toEqual([]);
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
