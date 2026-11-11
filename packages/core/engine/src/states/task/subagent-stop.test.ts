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
