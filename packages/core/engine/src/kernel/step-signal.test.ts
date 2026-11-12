import type { Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DecideInput } from "./decide-types.ts";
import {
  answer,
  approvalWorkflow,
  play,
  replyWorkflow,
  startInput,
} from "./kernel-test-kit.test-helper.ts";

/** A workflow whose only working state is `state`, named `work`, then a final state. */
function oneState(state: Partial<WorkflowState>): Workflow {
  return {
    ...replyWorkflow,
    context: { team: "billing" },
    initial: "work",
    states: {
      work: { type: "task", on: [{ to: "sent", event: "done" }], ...state } as WorkflowState,
      sent: { type: "final", on: [] },
    },
  };
}

const paid = {
  name: "invoice.paid",
  data: { vendor: "{{input.from}}", note: "{{context.note}}", team: "{{context.team}}", fixed: 7 },
};

const bodies = (log: ReturnType<typeof play>["log"]) =>
  log.map(({ runId: _r, seq: _s, at: _a, ...body }) => body);

verifies("engine.step-signal", () => {
  it("sends a task state's signal after its output and artifact, rendered from the context with the answer", () => {
    const workflow = oneState({
      agent: "writer",
      input: "Write to {{input.from}}",
      output: "note",
      artifact: { name: "note.md", mediaType: "text/markdown" },
      signal: paid,
    });
    const { decisions } = play(workflow, [startInput("sha-1"), answer("call-1", "Paid.")]);
    expect(decisions[1]?.events.slice(0, 5)).toEqual([
      { type: "agent.finished", state: "work", agent: "writer", output: "Paid." },
      { type: "context.updated", key: "note", value: "Paid." },
      expect.objectContaining({ type: "save-artifact", name: "note.md" }),
      {
        type: "signal.sent",
        state: "work",
        name: "invoice.paid",
        data: { vendor: "support", note: "Paid.", team: "billing", fixed: 7 },
      },
      { type: "transition", from: "work", to: "sent", event: "done" },
    ]);
  });

  it("sends a signal with no data as an empty object, and none for a state without one", () => {
    const signal = { name: "note.sent", data: {} };
    const sent = play(oneState({ agent: "writer", signal }), [
      startInput("sha-1"),
      answer("call-1", "Hi."),
    ]);
    expect(sent.log).toContainEqual(
      expect.objectContaining({ type: "signal.sent", name: "note.sent", data: {} }),
    );
    const quiet = play(oneState({ agent: "writer" }), [
      startInput("sha-1"),
      answer("call-1", "Hi."),
    ]);
    expect(quiet.log.map((event) => event.type)).not.toContain("signal.sent");
  });

  it("sends no signal when the step fails", () => {
    const failed: DecideInput = {
      type: "effect-failed",
      at: "2026-11-09T09:00:05.000Z",
      callId: "call-1",
      error: "No model answered.",
      reason: "model-unreachable",
    };
    const { log } = play(oneState({ agent: "writer", signal: paid }), [
      startInput("sha-1"),
      failed,
    ]);
    expect(log.map((event) => event.type)).not.toContain("signal.sent");
  });

  it("sends a parallel state's signal once every branch has ended, after the results", () => {
    const workflow = oneState({
      type: "parallel",
      branches: { a: { agent: "writer", input: "A" }, b: { agent: "writer", input: "B" } },
      output: "note",
      signal: paid,
    });
    const { decisions } = play(workflow, [
      startInput("sha-1"),
      answer("call-1", "one"),
      answer("call-2", "two"),
    ]);
    expect(decisions[1]?.events.map((event) => event.type)).not.toContain("signal.sent");
    expect(decisions[2]?.events.slice(1, 5)).toEqual([
      { type: "context.updated", key: "a", value: "one" },
      { type: "context.updated", key: "b", value: "two" },
      { type: "context.updated", key: "note", value: { a: "one", b: "two" } },
      {
        type: "signal.sent",
        state: "work",
        name: "invoice.paid",
        data: { vendor: "support", note: { a: "one", b: "two" }, team: "billing", fixed: 7 },
      },
    ]);
  });

  it("sends a foreach state's signal once every item has ended, after the results", () => {
    const workflow = oneState({
      type: "foreach",
      agent: "writer",
      items: "{{input.lines}}",
      input: "Line {{item}}",
      output: "note",
      signal: { name: "lines.checked", data: { count: "{{context.note.length}}" } },
    });
    const start = { ...startInput("sha-1"), input: { lines: ["x"] } };
    const { decisions } = play(workflow, [start, answer("call-1", "ok")]);
    expect(decisions[1]?.events.slice(1, 3)).toEqual([
      { type: "context.updated", key: "note", value: ["ok"] },
      { type: "signal.sent", state: "work", name: "lines.checked", data: { count: 1 } },
    ]);
  });

  it("sends a workflow state's signal after it keeps the child's context", () => {
    const workflow = oneState({
      type: "workflow",
      workflow: "approval",
      output: "decision",
      signal: { name: "approval.done", data: { outcome: "{{context.decision.outcome}}" } },
    });
    const done: DecideInput = {
      type: "child",
      at: "2026-11-09T09:01:00.000Z",
      childRunId: "r-acme.3",
      status: "completed",
      context: { outcome: "approved" },
    };
    const { log } = play(workflow, [startInput("sha-1"), done], undefined, {
      reply: workflow,
      approval: approvalWorkflow(),
    });
    expect(bodies(log).slice(-6, -3)).toEqual([
      expect.objectContaining({ type: "workflow.finished", status: "completed" }),
      { type: "context.updated", key: "decision", value: { outcome: "approved" } },
      { type: "signal.sent", state: "work", name: "approval.done", data: { outcome: "approved" } },
    ]);
  });
});
