import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { decide } from "../../kernel/decide.ts";
import type {
  ChildInput,
  ChildRunNow,
  DecideInput,
  StartInput,
} from "../../kernel/decide-types.ts";
import { InputRefused } from "../../kernel/input-refused.ts";
import {
  answer,
  approvalWorkflow,
  play,
  replyWorkflow,
  startInput,
} from "../../kernel/kernel-test-kit.test-helper.ts";
import { maxChildDepth } from "./state.ts";

/** A parent whose first state runs the approval workflow and keeps its context as `verdict`. */
const onboard: Workflow = {
  version: 1,
  id: "onboard",
  name: "Onboard a customer",
  initial: "check",
  context: {},
  states: {
    check: {
      type: "workflow",
      workflow: "approval",
      input: { who: "{{input.from}}", tries: "{{input.tries}}" },
      output: "verdict",
      on: [{ to: "welcome", event: "done" }],
    },
    welcome: { type: "final", on: [] },
  },
  layout: {},
};

const workflows = { onboard, approval: approvalWorkflow() };

const start: StartInput = {
  ...startInput("sha-1"),
  workflowId: "onboard",
  input: { from: "support", tries: 2 },
};

/** The child run the parent starts: its id is the parent's and the visit's `seq`. */
const childRunId = "r-acme.2";

function told(now: ChildRunNow, about = childRunId): ChildInput {
  return { type: "child", at: "2026-11-09T09:01:00.000Z", childRunId: about, ...now };
}

const bodies = (log: ReturnType<typeof play>["log"], from: number) =>
  log.slice(from).map(({ runId: _r, seq: _s, at: _a, ...body }) => body);

function playOnboard(inputs: readonly DecideInput[], workflow = onboard) {
  return play(workflow, inputs, undefined, workflows);
}

verifies("engine.workflow-state", () => {
  it("records workflow.started and asks for the child, with its input rendered", () => {
    const { decisions, run } = playOnboard([start]);
    expect(decisions[0]?.events.at(-1)).toEqual({
      type: "workflow.started",
      state: "check",
      workflow: "approval",
      childRunId,
    });
    expect(decisions[0]?.effects).toEqual([
      {
        type: "start-child",
        childRunId,
        state: "check",
        workflowId: "approval",
        input: { who: "support", tries: 2 },
        depth: 1,
      },
    ]);
    expect(run).toMatchObject({
      status: "running",
      child: { runId: childRunId, state: "check", workflow: "approval" },
    });
  });

  it("keeps the child's context under output and moves on done when the child completes", () => {
    const { log, run } = playOnboard([start, told({ status: "completed", context: { ok: 1 } })]);
    expect(bodies(log, 3)).toEqual([
      {
        type: "workflow.finished",
        state: "check",
        workflow: "approval",
        childRunId,
        status: "completed",
      },
      { type: "context.updated", key: "verdict", value: { ok: 1 } },
      { type: "transition", from: "check", to: "welcome", event: "done" },
      { type: "state.entered", state: "welcome" },
      { type: "run.completed", state: "welcome", context: { verdict: { ok: 1 } } },
    ]);
    expect(run).toMatchObject({ status: "completed", child: null });
  });

  it("waits with the child's events, and records nothing when told the same again", () => {
    const waiting = told({ status: "waiting", events: ["approve", "reject"] });
    const { log, decisions, run } = playOnboard([start, waiting, waiting]);
    expect(bodies(log, 3)).toEqual([
      { type: "run.waiting", state: "check", events: ["approve", "reject"], child: childRunId },
    ]);
    expect(decisions[2]).toEqual({ events: [], effects: [] });
    expect(run).toMatchObject({ status: "waiting", accepts: ["approve", "reject"] });

    const later = playOnboard([start, waiting, told({ status: "waiting", events: ["approve"] })]);
    expect(later.run?.accepts).toEqual(["approve"]);
  });

  it("fails the run when the child fails", () => {
    const { log, run } = playOnboard([start, told({ status: "failed", error: "No model." })]);
    expect(bodies(log, 3)).toEqual([
      {
        type: "workflow.finished",
        state: "check",
        workflow: "approval",
        childRunId,
        status: "failed",
        error: "No model.",
      },
      {
        type: "run.failed",
        state: "check",
        error: 'Workflow "approval" failed: No model.',
        reason: "error",
      },
    ]);
    expect(run).toMatchObject({ status: "failed", child: null });
  });

  it("changes nothing for news of a run it doesn't wait on", () => {
    const other = told({ status: "completed", context: {} }, "r-other");
    const { decisions } = playOnboard([start, other]);
    expect(decisions[1]).toEqual({ events: [], effects: [] });
  });

  it("refuses an event sent to it while the child waits; the event belongs to the child", () => {
    const { run } = playOnboard([start, told({ status: "waiting", events: ["approve"] })]);
    const send: DecideInput = { type: "send", at: start.at, event: "approve" };
    expect(() => decide(run, send, { workflow: onboard, workflows })).toThrow(InputRefused);
  });

  it.each([
    [
      "names no workflow",
      { ...onboard.states, check: { type: "workflow" as const, on: [] } },
      'Workflow state "check" names no workflow.',
    ],
    [
      "names a workflow the run didn't start with",
      { ...onboard.states, check: { type: "workflow" as const, workflow: "billing", on: [] } },
      `Workflow "billing" isn't among the definitions this run started with, so state "check" can't start it.`,
    ],
  ])("fails the run when the state %s", (_name, states, error) => {
    const { log } = playOnboard([start], { ...onboard, states });
    expect(log.at(-1)).toMatchObject({ type: "run.failed", state: "check", error });
  });

  it(`fails a child run that would nest more than ${maxChildDepth} deep`, () => {
    const parent = { runId: "r-up", state: "check", depth: maxChildDepth };
    const { log } = playOnboard([{ ...start, parent }]);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error: `State "check" would start a child run 6 deep; child runs nest at most 5 deep.`,
    });
  });
});

verifies("engine.child-tells-parent", () => {
  const parent = { runId: "r-up", state: "check", depth: 1 };
  const tell = { type: "tell-parent", parentRunId: "r-up", childRunId: "r-acme" };

  describe("a child run", () => {
    it("tells its parent when it waits", () => {
      const { decisions } = play(approvalWorkflow(), [{ ...startInput("sha-1"), parent }]);
      expect(decisions[0]?.effects).toContainEqual(tell);
    });

    it("tells its parent when it completes, and not while it runs", () => {
      const { decisions } = play(replyWorkflow, [
        { ...startInput("sha-1"), parent },
        answer("call-1", "On its way"),
      ]);
      expect(decisions[0]?.effects).not.toContainEqual(tell);
      expect(decisions[1]?.effects).toEqual([tell]);
    });

    it("tells its parent when a failed call fails it", () => {
      const failed: DecideInput = {
        type: "effect-failed",
        at: start.at,
        callId: "call-1",
        error: "No model.",
        reason: "error",
      };
      const { decisions } = play(replyWorkflow, [{ ...startInput("sha-1"), parent }, failed]);
      expect(decisions[1]?.effects).toEqual([tell]);
    });
  });

  it("tells no one when the run has no parent", () => {
    const { decisions } = play(approvalWorkflow(), [startInput("sha-1")]);
    expect(decisions[0]?.effects.map((effect) => effect.type)).toEqual(["set-timer"]);
  });
});
