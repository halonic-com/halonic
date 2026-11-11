import type { AgentResume } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DecideInput, ModelCallResult } from "../../kernel/decide-types.ts";
import { play, replyWorkflow, startInput } from "../../kernel/kernel-test-kit.test-helper.ts";

const start = startInput("sha-1");

/** Where the reader stopped: before `send_mail`. */
const readerResume: AgentResume = {
  messages: [{ role: "user", content: "Mail the total" }],
  calls: [{ id: "m-7", name: "send_mail", arguments: { to: "support" } }],
  step: 1,
};

/** The writer waits in `delegate_checker`, whose checker waits in `delegate_reader`. */
const resume: AgentResume = {
  messages: [{ role: "user", content: "Reply to support" }],
  calls: [{ id: "d-1", name: "delegate_checker", arguments: { task: "Check and mail" } }],
  step: 1,
  inner: {
    agent: "checker",
    resume: {
      messages: [{ role: "user", content: "Check and mail" }],
      calls: [{ id: "d-2", name: "delegate_reader", arguments: { task: "Mail the total" } }],
      step: 1,
      inner: { agent: "reader", resume: readerResume },
    },
  },
};

const call = { tool: "send_mail", args: { to: "support" }, resume };

/** `call-1` stops where the reader waits: for `result`. */
function stoppedFor(result: ModelCallResult): DecideInput {
  return { type: "effect-done", at: "2026-11-09T09:00:05.000Z", callId: "call-1", result };
}

verifies("engine.turn-subagent-stop", () => {
  it("names the subagent that asks in approval.requested, and keeps the state's agent", () => {
    const { decisions } = play(replyWorkflow, [start, stoppedFor({ type: "approval", ...call })]);

    expect(decisions[1]?.events[0]).toEqual({
      type: "approval.requested",
      state: "draft",
      agent: "writer",
      tool: "send_mail",
      args: { to: "support" },
      callId: "call-2",
      resume,
      subagent: "reader",
    });
  });

  it("names the subagent whose call it is in effect.requested", () => {
    const stopped = stoppedFor({ type: "effect", connector: "mail", ...call });

    const { decisions } = play(replyWorkflow, [start, stopped]);

    expect(decisions[1]?.events[0]).toMatchObject({
      type: "effect.requested",
      agent: "writer",
      connector: "mail",
      tool: "send_mail",
      subagent: "reader",
    });
  });
});

verifies("engine.turn-subagent-go-on", () => {
  it("credits the subagent with the call the engine makes, and goes on in the state's agent", () => {
    const sent: DecideInput = {
      type: "effect-done",
      at: "2026-11-09T09:00:06.000Z",
      callId: "call-2",
      result: { type: "tool", result: "Sent", outcome: "ok", risk: "send" },
    };
    const { decisions, run } = play(replyWorkflow, [
      start,
      stoppedFor({ type: "effect", connector: "mail", ...call }),
      sent,
    ]);

    expect(decisions[1]?.events).toContainEqual({
      type: "tool.called",
      agent: "reader",
      tool: "send_mail",
      args: { to: "support" },
    });
    expect(decisions[2]).toEqual({
      events: [
        {
          type: "tool.result",
          agent: "reader",
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
    expect(run).toMatchObject({ effect: null, pendingCall: { callId: "call-3", agent: "writer" } });
  });

  it("credits the subagent with a call that broke off, and waits for a person", () => {
    const brokeOff: DecideInput = {
      type: "effect-failed",
      at: "2026-11-09T09:00:06.000Z",
      callId: "call-2",
      error: "the connector went away",
      reason: "error",
    };
    const { decisions, run } = play(replyWorkflow, [
      start,
      stoppedFor({ type: "effect", connector: "mail", ...call }),
      brokeOff,
    ]);

    expect(decisions[2]?.events[0]).toMatchObject({
      type: "tool.result",
      agent: "reader",
      tool: "send_mail",
      outcome: "unknown",
    });
    expect(run).toMatchObject({ status: "waiting", effect: { callId: "call-2", unknown: true } });
  });
});
