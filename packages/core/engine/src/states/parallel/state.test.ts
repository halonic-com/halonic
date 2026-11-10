import type { RunFailureReason } from "@halonicjs/events";
import type { Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { DecideInput, StartInput } from "../../kernel/decide-types.ts";
import { answer, play, startInput, writerAgent } from "../../kernel/kernel-test-kit.test-helper.ts";

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
          web: { agent: "searcher", input: "Search the web for {{input.topic}}" },
          notes: { agent: "reader", input: "Read the notes on {{input.topic}}" },
        },
        output: "findings",
        on: [{ to: "done", event: "done" }],
        ...extra,
      },
      done: { type: "final", on: [] },
    },
    layout: {},
  };
}

const start: StartInput = {
  ...startInput("sha-1"),
  workflowId: "research",
  input: { topic: "tea" },
};

function failure(callId: string, reason: RunFailureReason = "model-unreachable"): DecideInput {
  return {
    type: "effect-failed",
    at: "2026-11-09T09:00:05.000Z",
    callId,
    error: "No model answered.",
    reason,
  };
}

const bodies = (log: ReturnType<typeof play>["log"], from: number) =>
  log.slice(from).map(({ runId: _r, seq: _s, at: _a, ...body }) => body);

verifies("engine.parallel-state", () => {
  it("starts every branch at once, in name order, each with its own call", () => {
    const { decisions } = play(researchWorkflow(), [start]);
    expect(decisions[0]?.events.slice(2)).toEqual([
      {
        type: "agent.started",
        state: "research",
        agent: "reader",
        prompt: "Read the notes on tea",
        branch: "notes",
      },
      {
        type: "agent.started",
        state: "research",
        agent: "searcher",
        prompt: "Search the web for tea",
        branch: "web",
      },
    ]);
    expect(decisions[0]?.effects).toEqual([
      {
        type: "call-model",
        callId: "call-1",
        state: "research",
        agent: "reader",
        prompt: "Read the notes on tea",
      },
      {
        type: "call-model",
        callId: "call-2",
        state: "research",
        agent: "searcher",
        prompt: "Search the web for tea",
      },
    ]);
  });

  it("waits for every branch, then writes the results in name order and moves on", () => {
    const { log, decisions, run } = play(researchWorkflow(), [
      start,
      answer("call-2", "w"),
      answer("call-1", "n"),
    ]);
    expect(decisions[1]?.events).toEqual([
      { type: "agent.finished", state: "research", agent: "searcher", output: "w", branch: "web" },
    ]);
    expect(bodies(log, 5)).toEqual([
      { type: "agent.finished", state: "research", agent: "reader", output: "n", branch: "notes" },
      { type: "context.updated", key: "notes", value: "n" },
      { type: "context.updated", key: "web", value: "w" },
      { type: "context.updated", key: "findings", value: { notes: "n", web: "w" } },
      { type: "transition", from: "research", to: "done", event: "done" },
      { type: "state.entered", state: "done" },
      expect.objectContaining({ type: "run.completed" }),
    ]);
    expect(run?.status).toBe("completed");
  });

  it("ignores a second answer to a branch that has ended", () => {
    const { decisions } = play(researchWorkflow(), [
      start,
      answer("call-1", "w"),
      answer("call-1", "again"),
    ]);
    expect(decisions[2]?.events).toEqual([]);
  });

  describe("a failed branch", () => {
    it("is recorded with its error and reason, and the run goes on", () => {
      const { decisions, run } = play(researchWorkflow(), [start, failure("call-2")]);
      expect(decisions[1]?.events).toEqual([
        {
          type: "agent.finished",
          state: "research",
          agent: "searcher",
          output: null,
          error: "No model answered.",
          reason: "model-unreachable",
          branch: "web",
        },
      ]);
      expect(run?.status).toBe("running");
    });

    it("fails the run once every branch has ended, with its reason (join: all)", () => {
      const { decisions, run } = play(researchWorkflow(), [
        start,
        failure("call-2"),
        answer("call-1", "n"),
      ]);
      expect(decisions[2]?.events.at(-1)).toEqual({
        type: "run.failed",
        state: "research",
        error: 'Branch "web" of parallel state "research" failed: No model answered.',
        reason: "model-unreachable",
      });
      expect(run?.status).toBe("failed");
    });

    it("gives { error } with continueOnError, and the run moves on", () => {
      const { log, run } = play(researchWorkflow({ continueOnError: true }), [
        start,
        failure("call-2"),
        answer("call-1", "n"),
      ]);
      expect(bodies(log, 6).slice(0, 3)).toEqual([
        { type: "context.updated", key: "notes", value: "n" },
        { type: "context.updated", key: "web", value: { error: "No model answered." } },
        {
          type: "context.updated",
          key: "findings",
          value: { notes: "n", web: { error: "No model answered." } },
        },
      ]);
      expect(run?.status).toBe("completed");
    });

    it("fails a join: any state only when every branch failed", () => {
      const one = play(researchWorkflow({ join: "any" }), [
        start,
        failure("call-2"),
        answer("call-1", "n"),
      ]);
      expect(one.run?.status).toBe("completed");
      const both = play(researchWorkflow({ join: "any" }), [
        start,
        failure("call-2"),
        failure("call-1", "provider-busy"),
      ]);
      expect(both.decisions[2]?.events.at(-1)).toEqual({
        type: "run.failed",
        state: "research",
        error:
          'Every branch of parallel state "research" failed; the first, "notes" failed: No model answered.',
        reason: "provider-busy",
      });
    });

    it("ends a branch whose agent stops for an approval", () => {
      const approval: DecideInput = {
        type: "effect-done",
        at: "2026-11-09T09:00:05.000Z",
        callId: "call-1",
        result: {
          type: "approval",
          tool: "send-mail",
          args: {},
          resume: { messages: [], calls: [], step: 1 },
        },
      };
      const { decisions, run } = play(researchWorkflow(), [start, approval]);
      expect(decisions[1]?.events).toEqual([
        expect.objectContaining({
          type: "agent.finished",
          branch: "notes",
          output: null,
          error:
            'Agent "reader" in branch "notes" of parallel state "research" stopped for an OK on ' +
            `tool "send-mail", and a parallel branch can't wait for a person.`,
          reason: "error",
        }),
      ]);
      expect(run?.approvals).toEqual([]);
      expect(run?.status).toBe("running");
    });
  });

  it("fails the run when the state has no branches", () => {
    const { run, log } = play(researchWorkflow({ branches: {} }), [start]);
    expect(run?.status).toBe("failed");
    expect(log.at(-1)).toMatchObject({ error: 'Parallel state "research" has no branches.' });
  });

  it("fails the run when a branch's agent runs in a program harness", () => {
    const agents = { searcher: { ...writerAgent("claude-code"), id: "searcher" } };
    const { run, log } = play(researchWorkflow(), [start], agents);
    expect(run?.status).toBe("failed");
    expect(log.at(-1)).toMatchObject({
      error:
        'Branch "web" of parallel state "research" runs agent "searcher" in the "claude-code" ' +
        "harness, and parallel branches can't run a harness yet.",
    });
  });
});
