import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { AgentResume } from "./agent-resume.ts";
import type { RunKind, RunParent, RunTrigger, Usage } from "./run-basics.ts";
import type { RunEvent, RunEventBase, RunEventBody, RunEventType } from "./run-event.ts";

// These are type tests: `tsc -p tsconfig.test.json` fails if a run log event
// gains, loses or changes a field. The expected shapes are copied from
// 784f78d:packages/core/events/src/index.ts, so a change here is a change to
// a user contract and needs a decision note.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

verifies("events.run-log-contract", () => {
  typeTest("has exactly the reference event types", () => {
    expectTypeOf<RunEventType>().toEqualTypeOf<
      | "run.started"
      | "state.entered"
      | "agent.started"
      | "llm.request"
      | "llm.response"
      | "llm.fallback"
      | "tool.called"
      | "knowledge.searched"
      | "tool.result"
      | "approval.requested"
      | "approval.resolved"
      | "agent.finished"
      | "artifact.created"
      | "context.updated"
      | "signal.sent"
      | "transition"
      | "workflow.started"
      | "workflow.finished"
      | "run.waiting"
      | "timer.fired"
      | "event.received"
      | "run.completed"
      | "run.failed"
    >();
  });

  typeTest("gives every event the reference base fields", () => {
    expectTypeOf<RunEventBase>().toEqualTypeOf<{
      runId: string;
      seq: number;
      at: string;
      branch?: string;
      item?: number;
    }>();
    expectTypeOf<RunEvent>().toEqualTypeOf<RunEventBase & RunEventBody>();
  });

  typeTest("keeps the run lifecycle events", () => {
    expectTypeOf<EventOf<"run.started">>().toEqualTypeOf<{
      type: "run.started";
      hubId: string;
      workflowId: string;
      input: Record<string, unknown>;
      kind: RunKind;
      definitionsVersion: string;
      trigger?: RunTrigger;
      parent?: RunParent;
    }>();
    expectTypeOf<EventOf<"state.entered">>().toEqualTypeOf<{
      type: "state.entered";
      state: string;
    }>();
    expectTypeOf<EventOf<"context.updated">>().toEqualTypeOf<{
      type: "context.updated";
      key: string;
      value: unknown;
    }>();
    expectTypeOf<EventOf<"transition">>().toEqualTypeOf<{
      type: "transition";
      from: string;
      to: string;
      event: string;
    }>();
    expectTypeOf<EventOf<"run.waiting">>().toEqualTypeOf<{
      type: "run.waiting";
      state: string;
      events: string[];
      child?: string;
      timers?: { after: string; at: string }[];
    }>();
    expectTypeOf<EventOf<"timer.fired">>().toEqualTypeOf<{
      type: "timer.fired";
      state: string;
      after: string;
    }>();
    expectTypeOf<EventOf<"event.received">>().toEqualTypeOf<{
      type: "event.received";
      event: string;
      payload?: unknown;
    }>();
    expectTypeOf<EventOf<"run.completed">>().toEqualTypeOf<{
      type: "run.completed";
      state: string;
      context: Record<string, unknown>;
    }>();
    // `reason` is added with the engine and must not be here yet.
    expectTypeOf<EventOf<"run.failed">>().toEqualTypeOf<{
      type: "run.failed";
      state: string | null;
      error: string;
    }>();
  });

  typeTest("keeps the agent and model events", () => {
    expectTypeOf<EventOf<"agent.started">>().toEqualTypeOf<{
      type: "agent.started";
      state: string;
      agent: string;
      prompt: string;
      parent?: string;
    }>();
    expectTypeOf<EventOf<"llm.request">>().toEqualTypeOf<{
      type: "llm.request";
      agent: string;
      provider: string;
      model: string;
      messages: number;
    }>();
    expectTypeOf<EventOf<"llm.response">>().toEqualTypeOf<{
      type: "llm.response";
      agent: string;
      provider: string;
      model: string;
      usage: Usage;
      latencyMs: number;
      text: string;
      thoughts?: string;
      cost?: number;
      cached?: boolean;
    }>();
    expectTypeOf<EventOf<"llm.fallback">>().toEqualTypeOf<{
      type: "llm.fallback";
      agent: string;
      from: string;
      to: string;
      error: string;
    }>();
    expectTypeOf<EventOf<"agent.finished">>().toEqualTypeOf<{
      type: "agent.finished";
      state: string;
      agent: string;
      output: unknown;
      parent?: string;
    }>();
  });

  typeTest("keeps the tool, knowledge and approval events", () => {
    expectTypeOf<EventOf<"tool.called">>().toEqualTypeOf<{
      type: "tool.called";
      agent: string;
      tool: string;
      args: unknown;
    }>();
    expectTypeOf<EventOf<"knowledge.searched">>().toEqualTypeOf<{
      type: "knowledge.searched";
      agent: string;
      source: string;
      query: string;
      refs: string[];
    }>();
    // `outcome` is added with the engine and must not be here yet.
    expectTypeOf<EventOf<"tool.result">>().toEqualTypeOf<{
      type: "tool.result";
      agent: string;
      tool: string;
      result: string;
    }>();
    expectTypeOf<EventOf<"approval.requested">>().toEqualTypeOf<{
      type: "approval.requested";
      state: string;
      agent: string;
      tool: string;
      args: unknown;
      callId: string;
      resume: AgentResume;
    }>();
    // `by` is added with the engine and must not be here yet.
    expectTypeOf<EventOf<"approval.resolved">>().toEqualTypeOf<{
      type: "approval.resolved";
      state: string;
      agent: string;
      tool: string;
      callId: string;
      approved: boolean;
      comment?: string;
    }>();
  });

  typeTest("keeps the artifact, signal and child workflow events", () => {
    expectTypeOf<EventOf<"artifact.created">>().toEqualTypeOf<{
      type: "artifact.created";
      state: string;
      name: string;
      hash: string;
      mediaType: string;
      size: number;
    }>();
    expectTypeOf<EventOf<"signal.sent">>().toEqualTypeOf<{
      type: "signal.sent";
      state: string;
      name: string;
      data: Record<string, unknown>;
    }>();
    expectTypeOf<EventOf<"workflow.started">>().toEqualTypeOf<{
      type: "workflow.started";
      state: string;
      workflow: string;
      childRunId: string;
    }>();
    expectTypeOf<EventOf<"workflow.finished">>().toEqualTypeOf<{
      type: "workflow.finished";
      state: string;
      workflow: string;
      childRunId: string;
      status: "completed" | "failed";
      error?: string;
    }>();
  });

  typeTest("keeps the shared types the events use", () => {
    expectTypeOf<RunKind>().toEqualTypeOf<"run" | "test">();
    expectTypeOf<Usage>().toEqualTypeOf<{ inputTokens: number; outputTokens: number }>();
    expectTypeOf<RunTrigger>().toEqualTypeOf<{
      type: "manual" | "schedule" | "every" | "mail" | "signal";
      routineId?: string;
      at: string;
      messageId?: string;
      signalId?: string;
    }>();
    expectTypeOf<RunParent>().toEqualTypeOf<{ runId: string; state: string; depth: number }>();
    expectTypeOf<AgentResume>().toEqualTypeOf<{
      messages: unknown[];
      calls: { id: string; name: string; arguments: Record<string, unknown> }[];
      step: number;
    }>();
  });
});
