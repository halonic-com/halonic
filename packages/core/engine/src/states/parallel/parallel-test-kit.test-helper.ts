import type { RunFailureReason } from "@halonicjs/events";
import type { Workflow, WorkflowState } from "@halonicjs/format";
import type { DecideInput, StartInput } from "../../kernel/decide-types.ts";
import { type play, startInput } from "../../kernel/kernel-test-kit.test-helper.ts";

/** A `research` state with two branches, then a final state. */
export function researchWorkflow(extra: Partial<WorkflowState> = {}): Workflow {
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

export const start: StartInput = {
  ...startInput("sha-1"),
  workflowId: "research",
  input: { topic: "tea" },
};

export function failure(
  callId: string,
  reason: RunFailureReason = "model-unreachable",
): DecideInput {
  return {
    type: "effect-failed",
    at: "2026-11-09T09:00:05.000Z",
    callId,
    error: "No model answered.",
    reason,
  };
}

export const bodies = (log: ReturnType<typeof play>["log"], from: number) =>
  log.slice(from).map(({ runId: _r, seq: _s, at: _a, ...body }) => body);
