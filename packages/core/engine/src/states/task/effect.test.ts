import type { AgentResume, ToolOutcome } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { decide } from "../../kernel/decide.ts";
import type { DecideInput, SendInput } from "../../kernel/decide-types.ts";
import { InputRefused } from "../../kernel/input-refused.ts";
import {
  answer,
  play,
  replyWorkflow,
  startInput,
} from "../../kernel/kernel-test-kit.test-helper.ts";
import { skippedEffectResult } from "../../kernel/requested-effect.ts";

const start = startInput("sha-1");

/** Where the writer stopped: its model called `send_mail` with its own id `m-7`. */
const resume: AgentResume = {
  messages: [{ role: "user", content: "Reply to support" }],
  calls: [{ id: "m-7", name: "send_mail", arguments: { to: "support" } }],
  step: 1,
};

/** `call-1` stops before `send_mail` on the `mail` connector. */
const stopped: DecideInput = {
  type: "effect-done",
  at: "2026-11-09T09:00:05.000Z",
  callId: "call-1",
  result: { type: "effect", connector: "mail", tool: "send_mail", args: { to: "support" }, resume },
};

/** The connector's answer to `callId`. */
const toolResult = (callId: string, result: string, outcome: ToolOutcome): DecideInput => ({
  type: "effect-done",
  at: "2026-11-09T09:00:06.000Z",
  callId,
  result: { type: "tool", result, outcome, risk: "send" },
});

const brokeOff = toolResult("call-2", "The call broke off without an answer.", "unknown");

const send = (event: string, fields: Partial<SendInput> = {}): SendInput => ({
  type: "send",
  at: "2026-11-09T10:00:00.000Z",
  event,
  ...fields,
});

/** What the engine records before it makes `call-2`, and the effect that makes it. */
const callTwo = {
  events: [
    {
      type: "effect.requested",
      state: "draft",
      agent: "writer",
      connector: "mail",
      tool: "send_mail",
      args: { to: "support" },
      callId: "call-2",
      idempotencyKey: "r-acme:call-2",
      resume,
    },
    {
      type: "connector.started",
      state: "draft",
      agent: "writer",
      connector: "mail",
      timeoutMs: 60_000,
    },
    { type: "tool.called", agent: "writer", tool: "send_mail", args: { to: "support" } },
  ],
  effects: [
    {
      type: "call-tool",
      callId: "call-2",
      idempotencyKey: "r-acme:call-2",
      state: "draft",
      agent: "writer",
      connector: "mail",
      tool: "send_mail",
      args: { to: "support" },
      timeoutMs: 60_000,
    },
  ],
};

verifies("engine.connector-effects", () => {
  it("records the call and its key before it asks for the call", () => {
    const { decisions, run } = play(replyWorkflow, [start, stopped]);
    expect(decisions[1]).toEqual(callTwo);
    expect(run).toMatchObject({
      status: "running",
      pendingCall: null,
      effect: { callId: "call-2", idempotencyKey: "r-acme:call-2", unknown: false },
    });
  });

  it("records the answer and lets the agent go on with it in the next call", () => {
    const { decisions, run } = play(replyWorkflow, [
      start,
      stopped,
      toolResult("call-2", "Sent", "ok"),
    ]);
    expect(decisions[2]).toEqual({
      events: [
        {
          type: "tool.result",
          agent: "writer",
          tool: "send_mail",
          result: "Sent",
          outcome: "ok",
          risk: "send",
        },
      ],
      effects: [
        {
          type: "call-model",
          callId: "call-3",
          state: "draft",
          agent: "writer",
          prompt: "Reply to support",
          resume: { resume, result: "Sent", outcome: "ok" },
        },
      ],
    });
    expect(run).toMatchObject({ effect: null, pendingCall: { callId: "call-3" } });
  });

  it("finishes the agent with the answer of the call that went on", () => {
    const { run } = play(replyWorkflow, [
      start,
      stopped,
      toolResult("call-2", "Sent", "ok"),
      answer("call-3", "Done"),
    ]);
    expect(run).toMatchObject({ status: "completed", context: { reply: "Done" } });
  });

  it("ignores a result for a call the state doesn't wait on", () => {
    const { decisions } = play(replyWorkflow, [start, stopped, toolResult("call-9", "Sent", "ok")]);
    expect(decisions[2]).toEqual({ events: [], effects: [] });
  });
});

verifies("engine.unknown-outcome", () => {
  it("waits for a person when the call broke off, and makes no call on its own", () => {
    const { decisions, run } = play(replyWorkflow, [start, stopped, brokeOff]);
    expect(decisions[2]).toEqual({
      events: [
        {
          type: "tool.result",
          agent: "writer",
          tool: "send_mail",
          result: "The call broke off without an answer.",
          outcome: "unknown",
          risk: "send",
        },
        { type: "run.waiting", state: "draft", events: ["retry", "skip"] },
      ],
      effects: [],
    });
    expect(run).toMatchObject({ status: "waiting", pendingCall: null, effect: { unknown: true } });
  });

  it("makes the call again under the same call id and key on retry", () => {
    const retry = send("retry", { callId: "call-2" });
    const { decisions, run } = play(replyWorkflow, [start, stopped, brokeOff, retry]);
    expect(decisions[3]).toEqual({
      events: [{ type: "event.received", event: "retry" }, ...callTwo.events],
      effects: callTwo.effects,
    });
    expect(run).toMatchObject({ status: "running", calls: 2, effect: { unknown: false } });
  });

  it("lets the agent go on with an unknown outcome on skip", () => {
    const { decisions, run } = play(replyWorkflow, [start, stopped, brokeOff, send("skip")]);
    expect(decisions[3]).toEqual({
      events: [{ type: "event.received", event: "skip" }],
      effects: [
        {
          type: "call-model",
          callId: "call-3",
          state: "draft",
          agent: "writer",
          prompt: "Reply to support",
          resume: { resume, result: skippedEffectResult, outcome: "unknown" },
        },
      ],
    });
    expect(run).toMatchObject({
      status: "running",
      effect: null,
      pendingCall: { callId: "call-3" },
    });
  });

  it("refuses a retry for a call the run doesn't wait on, and records nothing", () => {
    const { run } = play(replyWorkflow, [start, stopped, brokeOff]);
    const refused = () =>
      decide(run, send("retry", { callId: "call-1" }), { workflow: replyWorkflow });
    expect(refused).toThrow(InputRefused);
    expect(refused).toThrow(expect.objectContaining({ code: "engine.decision-callid-must-match" }));
  });
});
