import type { AgentResume } from "@halonicjs/events";
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

const start = startInput("sha-1");

/** Where the writer stopped: its model called `send_mail` with its own id `m-7`. */
const resume: AgentResume = {
  messages: [{ role: "user", content: "Reply to support" }],
  calls: [{ id: "m-7", name: "send_mail", arguments: { to: "support" } }],
  step: 1,
};

/** `call-1` stops at `send_mail`, waiting for a person's OK. */
const stopped: DecideInput = {
  type: "effect-done",
  at: "2026-11-09T09:00:05.000Z",
  callId: "call-1",
  result: { type: "approval", tool: "send_mail", args: { to: "support" }, resume },
};

const send = (event: string, fields: Partial<SendInput> = {}): SendInput => ({
  type: "send",
  at: "2026-11-09T10:00:00.000Z",
  event,
  ...fields,
});

verifies("engine.task-approvals", () => {
  it("asks for the approval under a call id of its own, and waits for a person", () => {
    const { decisions, run } = play(replyWorkflow, [start, stopped]);
    expect(decisions[1]).toEqual({
      events: [
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          tool: "send_mail",
          args: { to: "support" },
          callId: "call-2",
          resume,
        },
        { type: "run.waiting", state: "draft", events: ["approve", "reject"] },
      ],
      effects: [],
    });
    expect(run).toMatchObject({ status: "waiting", pendingCall: null });
  });

  it("records a person's approval, and lets the agent go on in the next call", () => {
    const approve = send("approve", { callId: "call-2", payload: { comment: "Fine" } });
    const { decisions, run } = play(replyWorkflow, [start, stopped, approve]);
    expect(decisions[2]).toEqual({
      events: [
        { type: "event.received", event: "approve", payload: { comment: "Fine" } },
        {
          type: "approval.resolved",
          state: "draft",
          agent: "writer",
          tool: "send_mail",
          callId: "call-2",
          approved: true,
          comment: "Fine",
          by: "person",
        },
      ],
      effects: [
        {
          type: "call-model",
          callId: "call-3",
          state: "draft",
          agent: "writer",
          prompt: "Reply to support",
          resume: { resume, approved: true, comment: "Fine" },
        },
      ],
    });
    expect(run).toMatchObject({ status: "running", approvals: [], accepts: [] });
    expect(run?.pendingCall?.callId).toBe("call-3");
  });

  it("answers the state's approval when a rejection names no call", () => {
    const { decisions } = play(replyWorkflow, [start, stopped, send("reject")]);
    expect(decisions[2]?.events[1]).toMatchObject({ callId: "call-2", approved: false });
    expect(decisions[2]?.effects).toMatchObject([
      { type: "call-model", callId: "call-3", resume: { resume, approved: false } },
    ]);
  });

  it("refuses an answer for a call the run doesn't wait on, and records nothing", () => {
    const { run } = play(replyWorkflow, [start, stopped]);
    const refused = () =>
      decide(run, send("approve", { callId: "call-1" }), { workflow: replyWorkflow });
    expect(refused).toThrow(InputRefused);
    expect(refused).toThrow(expect.objectContaining({ code: "engine.decision-callid-must-match" }));
  });

  it("finishes the agent with the answer of the call that went on", () => {
    const { log, run } = play(replyWorkflow, [
      start,
      stopped,
      send("approve"),
      answer("call-3", "Sent"),
    ]);
    expect(log.slice(-5).map((event) => event.type)).toEqual([
      "agent.finished",
      "context.updated",
      "transition",
      "state.entered",
      "run.completed",
    ]);
    expect(run).toMatchObject({ status: "completed", context: { reply: "Sent" } });
  });

  it("ignores a stop for an approval from a call the state doesn't wait on", () => {
    const { decisions } = play(replyWorkflow, [start, { ...stopped, callId: "call-9" }]);
    expect(decisions[1]).toEqual({ events: [], effects: [] });
  });
});
