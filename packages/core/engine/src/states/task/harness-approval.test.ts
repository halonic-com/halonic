import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { decide } from "../../kernel/decide.ts";
import type { DecideInput, HarnessAskedInput, SendInput } from "../../kernel/decide-types.ts";
import {
  answer,
  play,
  replyWorkflow,
  startInput,
  writerAgent,
} from "../../kernel/kernel-test-kit.test-helper.ts";
import { foldRun } from "../../kernel/run-state.ts";
import { nothingToResume } from "./approval.ts";

const start = startInput("sha-1");
const agents = { writer: writerAgent("claude-code") };

/** The harness call `callId` asks to run `rm -r drafts`, and goes on running. */
const asked = (callId: string): HarnessAskedInput => ({
  type: "harness-asked",
  at: "2026-11-09T09:00:05.000Z",
  callId,
  tool: "Bash",
  args: { command: "rm -r drafts" },
});

const send = (event: string, fields: Partial<SendInput> = {}): SendInput => ({
  type: "send",
  at: "2026-11-09T10:00:00.000Z",
  event,
  ...fields,
});

verifies("engine.harness-approvals", () => {
  it("records the harness's question under a call id of its own, and waits for a person", () => {
    const { decisions, run } = play(replyWorkflow, [start, asked("call-1")], agents);

    expect(decisions[1]).toEqual({
      events: [
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          tool: "Bash",
          args: { command: "rm -r drafts" },
          callId: "call-2",
          resume: nothingToResume,
        },
        { type: "run.waiting", state: "draft", events: ["approve", "reject"] },
      ],
      effects: [],
    });
    expect(run).toMatchObject({ status: "waiting", pendingCall: null });
  });

  it("passes a person's answer to the harness call, which goes on under the next call id", () => {
    const approve = send("approve", { callId: "call-2", payload: { comment: "Fine" } });
    const { decisions, run } = play(replyWorkflow, [start, asked("call-1"), approve], agents);

    expect(decisions[2]).toEqual({
      events: [
        { type: "event.received", event: "approve", payload: { comment: "Fine" } },
        {
          type: "approval.resolved",
          state: "draft",
          agent: "writer",
          tool: "Bash",
          callId: "call-2",
          approved: true,
          comment: "Fine",
          by: "person",
        },
      ],
      effects: [
        {
          type: "answer-harness",
          callId: "call-3",
          state: "draft",
          agent: "writer",
          approved: true,
          comment: "Fine",
        },
      ],
    });
    expect(run).toMatchObject({ status: "running", pendingCall: { callId: "call-3" } });
  });

  it("takes a second question after an answer, and finishes on the result after a rejection", () => {
    const { decisions, run } = play(
      replyWorkflow,
      [
        start,
        asked("call-1"),
        send("approve"),
        asked("call-3"),
        send("reject", { callId: "call-4" }),
        answer("call-5", "Left the drafts alone"),
      ],
      agents,
    );

    expect(decisions[3]?.events[0]).toMatchObject({ type: "approval.requested", callId: "call-4" });
    expect(decisions[4]?.effects).toEqual([
      {
        type: "answer-harness",
        callId: "call-5",
        state: "draft",
        agent: "writer",
        approved: false,
      },
    ]);
    expect(decisions[5]?.events[0]).toEqual({
      type: "agent.finished",
      state: "draft",
      agent: "writer",
      output: "Left the drafts alone",
    });
    expect(run).toMatchObject({ status: "completed", context: { reply: "Left the drafts alone" } });
  });

  it("decides the same on a replayed log as in the live run, and starts no harness", () => {
    const approve = send("approve", { callId: "call-2" });
    const live = play(replyWorkflow, [start, asked("call-1"), approve], agents);
    const stored = play(replyWorkflow, [start, asked("call-1")], agents).log;

    const replayed = foldRun(JSON.parse(JSON.stringify(stored)) as RunEvent[]);
    const decision = decide(replayed, approve, { workflow: replyWorkflow, agents });

    expect(stored.at(-1)?.type).toBe("run.waiting");
    expect(decision).toEqual(live.decisions[2]);
    expect(decision.effects.map((effect) => effect.type)).toEqual(["answer-harness"]);
  });

  it("changes nothing for a question from a call the state doesn't wait on", () => {
    const { decisions } = play(replyWorkflow, [start, asked("call-9")], agents);

    expect(decisions[1]).toEqual({ events: [], effects: [] });
  });

  it("changes nothing for a question while Halonic's own loop runs the agent", () => {
    const inputs: DecideInput[] = [start, asked("call-1")];
    const { decisions } = play(replyWorkflow, inputs, { writer: writerAgent() });

    expect(decisions[1]).toEqual({ events: [], effects: [] });
  });
});
