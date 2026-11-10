import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkRunTakes, decide } from "../../kernel/decide.ts";
import type { DecideInput, SendInput, StartInput, TimerInput } from "../../kernel/decide-types.ts";
import { InputRefused } from "../../kernel/input-refused.ts";
import { approvalWorkflow, play, startInput } from "../../kernel/kernel-test-kit.test-helper.ts";
import { foldRun, type RunState } from "../../kernel/run-state.ts";

const start: StartInput = { ...startInput("sha-1"), workflowId: "approval" };

const send = (event: string, fields: Partial<SendInput> = {}): SendInput => ({
  type: "send",
  at: "2026-11-09T10:00:00.000Z",
  event,
  ...fields,
});

const timer = (key: string, at: string): TimerInput => ({ type: "timer", at, key });

/** The key of the 2d timer set when the run entered `decide` as its second event. */
const firstVisitTimer = "2:2";

function refusal(workflow: Workflow, inputs: readonly DecideInput[], input: DecideInput) {
  const { run } = play(workflow, inputs);
  try {
    decide(run, input, { workflow });
  } catch (error) {
    return error instanceof InputRefused ? error.code : error;
  }
  return "accepted";
}

verifies("engine.wait-state", () => {
  it("records what the state waits for, and sets a timer for each of its timers", () => {
    const { decisions, run } = play(approvalWorkflow(), [start]);
    expect(decisions[0]?.events.at(-1)).toEqual({
      type: "run.waiting",
      state: "decide",
      events: ["approve", "reject"],
      timers: [{ after: "2d", at: "2026-11-11T09:00:00.000Z" }],
    });
    expect(decisions[0]?.effects).toEqual([
      { type: "set-timer", key: firstVisitTimer, at: "2026-11-11T09:00:00.000Z" },
    ]);
    expect(run).toMatchObject({ status: "waiting", accepts: ["approve", "reject"] });
  });

  it("lists no timers when the state has none", () => {
    const workflow = approvalWorkflow();
    const untimed: Workflow = {
      ...workflow,
      states: {
        ...workflow.states,
        decide: { type: "wait", on: [{ to: "approved", event: "approve" }] },
      },
    };
    const { decisions } = play(untimed, [start]);
    expect(decisions[0]?.events.at(-1)).toEqual({
      type: "run.waiting",
      state: "decide",
      events: ["approve"],
    });
    expect(decisions[0]?.effects).toEqual([]);
  });

  /** The approval workflow with `decide` described as given. */
  function describedAs(description: string): Workflow {
    const workflow = approvalWorkflow();
    const decide = workflow.states["decide"];
    if (decide?.type !== "wait") throw new Error("expected decide to be a wait state");
    return { ...workflow, states: { ...workflow.states, decide: { ...decide, description } } };
  }

  it("fills in the state's description against the run, once, as a title and a body", () => {
    const described = describedAs("Approve?\nOutcome: {{context.outcome}}\n{{context.note}}");
    const { decisions } = play(described, [start]);
    expect(decisions[0]?.events.at(-1)).toMatchObject({
      type: "run.waiting",
      title: "Approve?",
      body: "Outcome: pending",
    });
  });

  it("writes no title or body when the state has no description, or an empty one", () => {
    for (const workflow of [approvalWorkflow(), describedAs("")]) {
      const waiting = play(workflow, [start]).decisions[0]?.events.at(-1);
      expect(waiting).not.toHaveProperty("title");
      expect(waiting).not.toHaveProperty("body");
    }
  });

  it("writes the payload to lastEvent and moves on the event", () => {
    const { log } = play(approvalWorkflow(), [start, send("approve", { payload: { note: "ok" } })]);
    expect(log.slice(3).map(({ runId: _r, seq: _s, at: _a, ...body }) => body)).toEqual([
      { type: "event.received", event: "approve", payload: { note: "ok" } },
      { type: "context.updated", key: "lastEvent", value: { note: "ok" } },
      { type: "transition", from: "decide", to: "approved", event: "approve" },
      { type: "state.entered", state: "approved" },
      {
        type: "run.completed",
        state: "approved",
        context: { outcome: "pending", lastEvent: { note: "ok" } },
      },
    ]);
  });

  it("writes nothing to the context for an event without a payload", () => {
    const { log } = play(approvalWorkflow(), [start, send("reject")]);
    expect(log[3]).toMatchObject({ type: "event.received", event: "reject" });
    expect(log[3]).not.toHaveProperty("payload");
    expect(log[4]).toMatchObject({ type: "transition", to: "rejected" });
  });

  it("checks the guards with the payload, and refuses an event no guard lets through", () => {
    const guarded = approvalWorkflow();
    const decideState = guarded.states["decide"];
    if (decideState === undefined) throw new Error("expected the decide state");
    const workflow: Workflow = {
      ...guarded,
      states: {
        ...guarded.states,
        decide: {
          ...decideState,
          on: [
            { to: "approved", event: "approve", when: { exists: "context.lastEvent.note" } },
            ...decideState.on.slice(1),
          ],
        },
      },
    };
    expect(refusal(workflow, [start], send("approve"))).toBe("engine.input-not-accepted");
    const { log } = play(workflow, [start, send("approve", { payload: { note: "ok" } })]);
    expect(log.at(-1)).toMatchObject({ type: "run.completed", state: "approved" });
  });

  it("refuses an event the state doesn't take", () => {
    expect(refusal(approvalWorkflow(), [start], send("done"))).toBe("engine.input-not-accepted");
  });
});

verifies("engine.wait-timers", () => {
  it("fires a timer that is due and moves on after its delay", () => {
    const { log } = play(approvalWorkflow(), [
      start,
      timer(firstVisitTimer, "2026-11-11T09:00:00.000Z"),
    ]);
    expect(log.slice(3).map(({ type }) => type)).toEqual([
      "timer.fired",
      "transition",
      "state.entered",
      "run.completed",
    ]);
    expect(log[3]).toMatchObject({ type: "timer.fired", state: "decide", after: "2d" });
    expect(log[4]).toMatchObject({ from: "decide", to: "expired", event: "after 2d" });
  });

  it("sets a timer that arrives early again, for its due time", () => {
    const { decisions } = play(approvalWorkflow(), [
      start,
      timer(firstVisitTimer, "2026-11-10T09:00:00.000Z"),
    ]);
    expect(decisions[1]).toEqual({
      events: [],
      effects: [{ type: "set-timer", key: firstVisitTimer, at: "2026-11-11T09:00:00.000Z" }],
    });
  });

  it("ignores a timer set on an earlier visit to the state", () => {
    const workflow = approvalWorkflow([{ to: "decide", event: "again" }]);
    const { decisions } = play(workflow, [
      start,
      send("again"),
      timer(firstVisitTimer, "2026-11-11T09:00:00.000Z"),
    ]);
    expect(decisions[1]?.effects).toEqual([
      { type: "set-timer", key: "6:2", at: "2026-11-11T10:00:00.000Z" },
    ]);
    expect(decisions[2]).toEqual({ events: [], effects: [] });
  });

  it("takes the timer due first, and leaves a due timer whose guard fails unfired", () => {
    const workflow = approvalWorkflow([
      { to: "approved", event: "done", after: "1d", when: { exists: "context.never" } },
      { to: "rejected", event: "done", after: "36h" },
    ]);
    const early = play(workflow, [start, timer("2:3", "2026-11-10T12:00:00.000Z")]);
    expect(early.decisions[1]).toEqual({ events: [], effects: [] });
    const { log } = play(workflow, [start, timer("2:2", "2026-11-12T09:00:00.000Z")]);
    expect(log[4]).toMatchObject({ to: "rejected", event: "after 36h" });
  });

  it("ignores a timer whose key isn't one it set", () => {
    const { decisions } = play(approvalWorkflow(), [
      start,
      timer("wait", "2026-11-11T09:00:00.000Z"),
    ]);
    expect(decisions[1]).toEqual({ events: [], effects: [] });
  });
});

verifies("engine.decision-callid-must-match", () => {
  it("refuses an event for a call the run doesn't wait on", () => {
    expect(refusal(approvalWorkflow(), [start], send("approve", { callId: "call-1" }))).toBe(
      "engine.decision-callid-must-match",
    );
  });

  it("lets an event through for a call whose approval the run waits on", () => {
    const { log } = play(approvalWorkflow(), [start]);
    const waiting = foldRun([
      ...log,
      {
        type: "approval.requested",
        state: "decide",
        agent: "writer",
        tool: "send_mail",
        args: {},
        callId: "call-2",
        resume: { messages: [], calls: [], step: 1 },
        runId: "r-acme",
        seq: log.length + 1,
        at: start.at,
      },
    ]) as RunState;
    expect(() => checkRunTakes(waiting, send("approve", { callId: "call-2" }))).not.toThrow();
    expect(() => checkRunTakes(waiting, send("approve", { callId: "call-9" }))).toThrow(
      'Run "r-acme" doesn\'t wait on call "call-9".',
    );
  });
});
