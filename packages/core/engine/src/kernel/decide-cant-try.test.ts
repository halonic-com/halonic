import type { CantTryStep } from "@halonicjs/events";
import { type RunEvent, summarize } from "@halonicjs/events";
import type { Workflow, WorkflowState } from "@halonicjs/format";
import { CantTryError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { failedCallInput } from "../run/failed-call-input.ts";
import { decide } from "./decide.ts";
import type { DecideInput, StartInput } from "./decide-types.ts";
import { InputRefused } from "./input-refused.ts";
import {
  answer,
  approvalWorkflow,
  play,
  replyWorkflow,
  startInput,
} from "./kernel-test-kit.test-helper.ts";

// A Try it or Test run with steps it can't try, because they need a change
// left out of the run.

const item = "workflows/reply.yaml";
const failedAt = "2026-11-09T09:00:05.000Z";

function cantTry(step: string | null, path = "models.yaml"): CantTryStep {
  return {
    status: "cant-try",
    item,
    step,
    reason: { kind: "needs-left-out-change", path, leftOut: "models" },
  };
}

/** The input a call gives when its adapter says the step can't be tried. */
function cantTryCall(callId: string, step: string, path = "models.yaml"): DecideInput {
  const reason = { kind: "needs-left-out-change", path, leftOut: "models" } as const;
  const error = new CantTryError(item, reason, "The step uses a change you haven't accepted.");
  return failedCallInput(error, { callId, at: failedAt, step });
}

const startWith = (found: CantTryStep[], start: StartInput = startInput("sha-1")): StartInput => ({
  ...start,
  cantTry: found,
});

const bodies = (log: readonly RunEvent[]) =>
  log.map(({ runId: _r, seq: _s, at: _a, ...body }) => body);

/** A `research` state with two branches, then a final state. */
function researchWorkflow(extra: Partial<WorkflowState> = {}): Workflow {
  return {
    version: 1,
    id: "research",
    name: "Research a topic",
    initial: "research",
    context: {},
    states: {
      research: {
        type: "parallel",
        branches: {
          notes: { agent: "reader", input: "Read the notes" },
          web: { agent: "searcher", input: "Search the web" },
        },
        on: [{ to: "done", event: "done" }],
        ...extra,
      },
      done: { type: "final", on: [] },
    },
    layout: {},
  };
}

const startResearch = { ...startInput("sha-1"), workflowId: "research" };

verifies("engine.run-cant-try", () => {
  describe("found at load", () => {
    it("ends the run at the step, after entering it, and asks for no call", () => {
      const { decisions, log, run } = play(replyWorkflow, [startWith([cantTry("draft")])]);
      expect(bodies(log)).toEqual([
        expect.objectContaining({ type: "run.started", cantTry: [cantTry("draft")] }),
        { type: "state.entered", state: "draft" },
        { type: "run.cant-try", state: "draft", cantTry: [cantTry("draft")] },
      ]);
      expect(decisions[0]?.effects).toEqual([]);
      expect(run?.status).toBe("cant-try");
      expect(summarize(log)).toMatchObject({ status: "cant-try", cantTry: [cantTry("draft")] });
    });

    it("enters no state when the whole item can't be tried", () => {
      const { log, run } = play(replyWorkflow, [startWith([cantTry(null)])]);
      expect(bodies(log).slice(1)).toEqual([
        { type: "run.cant-try", state: null, cantTry: [cantTry(null)] },
      ]);
      expect(run?.status).toBe("cant-try");
    });

    it("leaves run.started as before when nothing is left out", () => {
      const { log } = play(replyWorkflow, [startWith([])]);
      expect(log[0]).not.toHaveProperty("cantTry");
      expect(log.at(-1)?.type).toBe("agent.started");
    });

    it("takes no more input once it ended", () => {
      const { run } = play(replyWorkflow, [startWith([cantTry("draft")])]);
      expect(() => decide(run, answer("call-1", "hi"), { workflow: replyWorkflow })).toThrow(
        InputRefused,
      );
    });
  });

  describe("found while running", () => {
    it("ends the run with every step it couldn't try, the ones found at load first", () => {
      const atLoad = cantTry("sent", "connections/mail.yaml");
      const { log, run } = play(replyWorkflow, [
        startWith([atLoad]),
        cantTryCall("call-1", "draft"),
      ]);
      expect(bodies(log).at(-1)).toEqual({
        type: "run.cant-try",
        state: "draft",
        cantTry: [atLoad, cantTry("draft")],
      });
      expect(run?.status).toBe("cant-try");
    });

    it("keeps an ordinary failure a failure", () => {
      const failed = failedCallInput(new Error("No model answered."), {
        callId: "call-1",
        at: failedAt,
        step: "draft",
      });
      const { log } = play(replyWorkflow, [startInput("sha-1"), failed]);
      expect(log.at(-1)).toMatchObject({ type: "run.failed", reason: "error" });
    });
  });

  describe("in a parallel state", () => {
    const reallyFailed: DecideInput = {
      type: "effect-failed",
      at: failedAt,
      callId: "call-2",
      error: "No model answered.",
      reason: "model-unreachable",
    };

    it("fails the run when another branch really failed, and keeps the step", () => {
      const { log, run } = play(researchWorkflow(), [
        startResearch,
        cantTryCall("call-1", "research"),
        reallyFailed,
      ]);
      expect(bodies(log)).toContainEqual({
        type: "agent.finished",
        state: "research",
        agent: "reader",
        output: null,
        error: "The step uses a change you haven't accepted.",
        cantTry: cantTry("research"),
        branch: "notes",
      });
      expect(log.at(-1)).toMatchObject({ type: "run.failed", reason: "model-unreachable" });
      expect(run?.status).toBe("failed");
      expect(summarize(log)).toMatchObject({ status: "failed", cantTry: [cantTry("research")] });
    });

    it("ends the run as can't-try even when the state would go on", () => {
      const { log, run } = play(researchWorkflow({ continueOnError: true }), [
        startResearch,
        cantTryCall("call-1", "research"),
        answer("call-2", "found it"),
      ]);
      expect(bodies(log).at(-1)).toEqual({
        type: "run.cant-try",
        state: "research",
        cantTry: [cantTry("research")],
      });
      expect(run?.status).toBe("cant-try");
    });
  });

  it("ends a workflow state's run when its child run couldn't try a step", () => {
    const onboard: Workflow = {
      version: 1,
      id: "onboard",
      name: "Onboard a customer",
      initial: "check",
      context: {},
      states: {
        check: { type: "workflow", workflow: "approval", on: [{ to: "welcome", event: "done" }] },
        welcome: { type: "final", on: [] },
      },
      layout: {},
    };
    const childStep = { ...cantTry("decide"), item: "workflows/approval.yaml" };
    const told: DecideInput = {
      type: "child",
      at: failedAt,
      childRunId: "r-acme.2",
      status: "cant-try",
      cantTry: [childStep],
    };
    const workflows = { onboard, approval: approvalWorkflow() };
    const start = { ...startInput("sha-1"), workflowId: "onboard" };
    const { log, run } = play(onboard, [start, told], undefined, workflows);
    expect(bodies(log).slice(-2)).toEqual([
      {
        type: "workflow.finished",
        state: "check",
        workflow: "approval",
        childRunId: "r-acme.2",
        status: "cant-try",
      },
      { type: "run.cant-try", state: "check", cantTry: [childStep] },
    ]);
    expect(run?.status).toBe("cant-try");
  });
});
