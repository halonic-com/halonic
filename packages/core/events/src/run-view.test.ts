import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunEvent, RunEventBody } from "./run-event.ts";
import { acmeMarks, everyKindLog, hidden } from "./run-view.test-fixture.ts";
import type { WaitingPoint } from "./run-view.ts";
import { toRunViewEvents } from "./run-view-events.ts";
import { runViewFailureSentence, runViewWords } from "./run-view-words.ts";
import { toRunView, waitingPointsOf } from "./to-run-view.ts";

const handleOf = (point: WaitingPoint) => `h-${point.kind}`;

/** A run log of acme run "r2": the chat's start, then the given bodies. */
function log(...bodies: RunEventBody[]): RunEvent[] {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "acme",
    workflowId: "support",
    input: { message: "Hello" },
    kind: "run",
    definitionsVersion: "v1",
  };
  return [started, ...bodies].map((body, index) => ({
    runId: "r2",
    seq: index + 1,
    at: `2026-11-26T11:00:0${index}.000Z`,
    ...body,
  }));
}

function viewOf(events: RunEvent[]) {
  const view = toRunView(events, acmeMarks, handleOf);
  if (view === null) throw new Error("expected a run view");
  return view;
}

verifies("events.run-view", () => {
  describe("a run with every event kind", () => {
    it("keeps only the allowed fields in the view and its events", () => {
      const events = everyKindLog();
      const view = viewOf(events);
      const viewEvents = toRunViewEvents(events, acmeMarks);

      expect(JSON.stringify(view)).not.toContain(hidden);
      expect(JSON.stringify(viewEvents)).not.toContain(hidden);
      expect(view).toMatchObject({
        id: "r1",
        name: "Acme support",
        title: "Where is my order?",
        results: { ticket: "T-1" },
        files: [{ name: "summary.pdf", mediaType: "application/pdf", size: 1200 }],
        usage: { inputTokens: 100, outputTokens: 20 },
      });
      expect(view.messages.map(({ from, text }) => ({ from, text }))).toEqual([
        { from: "you", text: "Where is my order?\nIt's late." },
        { from: "product", text: "It ships today." },
      ]);
      expect(new Set(viewEvents.map((event) => event.kind))).toEqual(
        new Set(["message", "file", "waiting", "answered", "completed", "failed"]),
      );
    });
  });

  it("leaves out an event kind it doesn't know", () => {
    const newer = { runId: "r2", seq: 2, at: "T2", type: "brand.new", secret: hidden };
    const events = [...log(), newer as unknown as RunEvent];
    expect(toRunViewEvents(events, acmeMarks)).toEqual([
      { seq: 1, at: "2026-11-26T11:00:00.000Z", kind: "message", from: "you", text: "Hello" },
    ]);
  });

  it("asks for an approval with the seller's text only", () => {
    const view = viewOf(
      log(
        {
          type: "approval.requested",
          state: "ship",
          agent: "shipper",
          tool: "push",
          connector: "github",
          args: { branch: "fix-login", repo: "acme/shop", force: { deep: true } },
          callId: "call-1",
          resume: { messages: [], calls: [], step: 1 },
        },
        { type: "run.waiting", state: "ship", events: ["approve", "reject"] },
      ),
    );
    expect(view.waitsFor).toBe("you");
    expect(view.asks).toEqual([
      {
        answer: {
          handle: "h-approval",
          kind: "approval",
          payloadSchema: { type: "approve-or-reject" },
        },
        title: "Push branch fix-login to acme/shop",
        body: "",
      },
    ]);
  });

  it("asks with the fixed line when the seller wrote no approval text", () => {
    const view = viewOf(
      log(
        {
          type: "approval.requested",
          state: "ship",
          agent: "shipper",
          tool: "delete",
          args: {},
          callId: "call-2",
          resume: { messages: [], calls: [], step: 1 },
        },
        { type: "run.waiting", state: "ship", events: ["approve", "reject"] },
      ),
    );
    expect(view.asks.map((ask) => ask.title)).toEqual([runViewWords.approval]);
  });

  it("offers only labelled answers as choices, and a handle for the next message", () => {
    const points: WaitingPoint[] = [];
    const events = log({
      type: "run.waiting",
      state: "check",
      events: ["ok", "redo", "message"],
      labels: { ok: "Looks right" },
    });
    const view = toRunView(events, acmeMarks, (point) => {
      points.push(point);
      return `h-${points.length}`;
    });
    expect(view?.asks).toEqual([
      {
        answer: {
          handle: "h-1",
          kind: "question",
          payloadSchema: { type: "choice", choices: ["Looks right"] },
        },
        title: runViewWords.question,
        body: "",
      },
    ]);
    expect(view?.message).toEqual({
      handle: "h-2",
      kind: "message",
      payloadSchema: { type: "message", maxLength: 20_000 },
    });
    expect(points).toEqual([
      { kind: "question", state: "check", events: ["ok"] },
      { kind: "message", state: "check", event: "message" },
    ]);
  });

  it("lists the waiting points before any handle is made, as the view asks for them", () => {
    const events = log({
      type: "run.waiting",
      state: "check",
      events: ["ok", "message"],
      labels: { ok: "Looks right" },
    });
    expect(waitingPointsOf(events, acmeMarks)).toEqual([
      { kind: "question", state: "check", events: ["ok"] },
      { kind: "message", state: "check", event: "message" },
    ]);
    expect(waitingPointsOf(log(), acmeMarks)).toEqual([]);
  });

  it("waits for the next message, a timer or a plan limit", () => {
    const message = viewOf(log({ type: "run.waiting", state: "chat", events: ["message"] }));
    expect(message.waitsFor).toBe("message");
    expect(message.asks).toEqual([]);

    const timer = viewOf(
      log({ type: "run.waiting", state: "pause", events: [], timers: [{ after: "1h", at: "T9" }] }),
    );
    expect(timer).toMatchObject({ waitsFor: "timer", nextTimer: "T9" });

    const limit = viewOf(
      log({
        type: "run.limit-waiting",
        state: "reply",
        error: "plan stop",
        cause: { kind: "limit_reached", code: "plan.runs" },
        until: "T9",
        input: {},
      }),
    );
    expect(limit).toMatchObject({ waitsFor: "limit", limit: "plan.runs", asks: [] });
  });

  it("shows a received event only when it answers what the run waits for", () => {
    const answered = log(
      { type: "event.received", event: "deploy-hook", payload: { text: hidden } },
      { type: "run.waiting", state: "chat", events: ["message"] },
      { type: "event.received", event: "message", payload: { text: "Thanks!" } },
      { type: "event.received", event: "message", payload: { text: hidden } },
    );
    const viewEvents = toRunViewEvents(answered, acmeMarks);
    expect(viewEvents.map((event) => event.kind)).toEqual(["message", "waiting", "message"]);
    expect(JSON.stringify(viewEvents)).not.toContain(hidden);
    expect(viewOf(answered).messages.map((message) => message.text)).toEqual(["Hello", "Thanks!"]);
  });

  it("cuts each filled approval argument at 200 characters", () => {
    const view = viewOf(
      log(
        {
          type: "approval.requested",
          state: "ship",
          agent: "shipper",
          tool: "push",
          connector: "github",
          args: { branch: "b".repeat(300), repo: "acme/shop" },
          callId: "call-3",
          resume: { messages: [], calls: [], step: 1 },
        },
        { type: "run.waiting", state: "ship", events: ["approve", "reject"] },
      ),
    );
    expect(view.asks.map((ask) => ask.title)).toEqual([
      `Push branch ${"b".repeat(200)} to acme/shop`,
    ]);
  });

  it("names the plan limit only while the run waits at it", () => {
    const limitWaiting: RunEventBody = {
      type: "run.limit-waiting",
      state: "reply",
      error: "plan stop",
      cause: { kind: "limit_reached", code: "plan.runs" },
      until: "T9",
      input: {},
    };
    expect(viewOf(log(limitWaiting)).limit).toBe("plan.runs");
    const goneOn = viewOf(log(limitWaiting, { type: "state.entered", state: "reply" }));
    expect(goneOn).toMatchObject({ status: "running", limit: null, waitsFor: null });
  });

  describe("a failure", () => {
    const failed = (fields: Partial<Extract<RunEventBody, { type: "run.failed" }>>) =>
      viewOf(
        log({ type: "run.failed", state: "reply", error: "at /srv/acme/key.ts:3", ...fields }),
      );

    it("is a closed cause, never the error's text", () => {
      const view = failed({
        reason: "error",
        cause: { kind: "denied", code: "google.api-disabled", detail: { api: "drive" } },
      });
      expect(view.failure).toEqual({ cause: "connection", connection: "google" });
      expect(JSON.stringify(view)).not.toContain("/srv/acme");
    });

    it("tells a stop, a plan limit, a budget, an unavailable service and anything else apart", () => {
      expect(failed({ reason: "cancelled" }).failure).toEqual({ cause: "stopped" });
      expect(
        failed({ reason: "budget", cause: { kind: "limit_reached", code: "plan.tokens" } }).failure,
      ).toEqual({ cause: "limit", limit: "plan.tokens" });
      expect(failed({ reason: "budget" }).failure).toEqual({ cause: "limit", limit: "budget" });
      expect(failed({ reason: "provider-busy" }).failure).toEqual({ cause: "unavailable" });
      expect(failed({ cause: { kind: "unavailable" } }).failure).toEqual({ cause: "unavailable" });
      expect(failed({ cause: { kind: "denied", code: "Not A Name" } }).failure).toEqual({
        cause: "other",
      });
      expect(failed({}).failure).toEqual({ cause: "other" });
    });

    it("has a fixed sentence for each cause", () => {
      expect(runViewFailureSentence({ cause: "limit", limit: "plan.runs" })).toBe(
        "This run stopped at a limit of your plan (plan.runs).",
      );
      expect(runViewFailureSentence({ cause: "connection", connection: "google" })).toBe(
        "This run stopped because the connection google refused it.",
      );
      expect(runViewFailureSentence({ cause: "other" })).toBe(runViewWords.other);
    });
  });

  it("cuts the title at 80 characters and is null for a log without run.started", () => {
    const long = "x".repeat(100);
    const events = log().map((event) =>
      event.type === "run.started" ? { ...event, input: { message: long } } : event,
    );
    expect(viewOf(events).title).toBe("x".repeat(80));
    expect(toRunView([], acmeMarks, handleOf)).toBeNull();
  });
});
