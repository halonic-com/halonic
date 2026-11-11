import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { AgentResume } from "./agent-resume.ts";
import type {
  ApprovalResolver,
  CantTryStep,
  ProviderText,
  RunFailureReason,
  RunKind,
  RunParent,
  RunTrigger,
  RunVersion,
  StoredBlob,
  ToolNoun,
  ToolOutcome,
  ToolRisk,
  ToolVerb,
  Usage,
} from "./run-basics.ts";
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
      // Added after the reference by events.llm-skipped (HAL-1880).
      | "llm.skipped"
      | "tool.called"
      // Added after the reference by events.tool-refused (HAL-4658).
      | "tool.refused"
      // Added after the reference by events.started-events (HAL-189).
      | "sandbox.started"
      | "harness.started"
      // Added after the reference by events.sandbox-opened (HAL-1707).
      | "sandbox.opened"
      // Added after the reference by events.sandbox-off (HAL-1707).
      | "sandbox.off"
      // Added after the reference by events.sandbox-blocked (HAL-189).
      | "sandbox.blocked"
      // Added after the reference by events.connector-started (HAL-1728).
      | "connector.started"
      // Added after the reference by events.effect-requested (HAL-1532).
      | "effect.requested"
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
      // Added after the reference by events.run-cant-try (HAL-4285).
      | "run.cant-try"
    >();
  });

  typeTest("gives every event the reference base fields", () => {
    expectTypeOf<RunEventBase>().toEqualTypeOf<{
      runId: string;
      seq: number;
      at: string;
      branch?: string;
      item?: number;
      // Added after the reference by events.timeline-entry-id (HAL-974).
      entry?: number;
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
      // Added after the reference by events.run-started-harness (HAL-189).
      harness?: string;
      // Added after the reference by events.run-cant-try (HAL-4285).
      cantTry?: CantTryStep[];
      // Added after the reference by events.run-started-version (HAL-5173).
      version?: RunVersion;
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
      title?: string;
      body?: string;
      labels?: Record<string, string>;
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
    expectTypeOf<EventOf<"run.failed">>().toEqualTypeOf<{
      type: "run.failed";
      state: string | null;
      error: string;
      // Added after the reference by events.run-failed-reason (HAL-1525).
      reason?: RunFailureReason;
      // Added after the reference by events.run-failed-model-unreachable (HAL-1728).
      host?: string;
      // Added after the reference by events.run-failed-sandbox-not-ready (HAL-1709).
      sandboxReason?: string;
      // Added after the reference by events.provider-text (HAL-3119).
      providerText?: ProviderText;
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
      // Added after the reference by events.summary-cost (HAL-2311).
      paidBy?: "subscription";
      cached?: boolean;
      // Added after the reference by events.tool-call-as-text (HAL-1880).
      toolCallAsText?: true;
    }>();
    expectTypeOf<EventOf<"llm.fallback">>().toEqualTypeOf<{
      type: "llm.fallback";
      agent: string;
      from: string;
      to: string;
      error: string;
      // Added after the reference by events.provider-text (HAL-3119).
      providerText?: ProviderText;
    }>();
    expectTypeOf<EventOf<"agent.finished">>().toEqualTypeOf<{
      type: "agent.finished";
      state: string;
      agent: string;
      output: unknown;
      parent?: string;
      // Added after the reference by events.agent-finished-error (HAL-1536).
      error?: string;
      reason?: RunFailureReason;
      // Added after the reference by events.run-cant-try (HAL-4285).
      cantTry?: CantTryStep;
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
    expectTypeOf<EventOf<"tool.result">>().toEqualTypeOf<{
      type: "tool.result";
      agent: string;
      tool: string;
      result: string;
      // Added after the reference by events.tool-result-outcome (HAL-1525).
      outcome?: ToolOutcome;
      // Added after the reference by events.tool-result-risk (HAL-2831).
      risk?: ToolRisk;
      noun?: ToolNoun;
      // Added after the reference by events.tool-result-risk (HAL-2868).
      verb?: ToolVerb;
      // Added after the reference by events.tool-result-blob (HAL-1533).
      resultBlob?: StoredBlob;
    }>();
    expectTypeOf<EventOf<"approval.requested">>().toEqualTypeOf<{
      type: "approval.requested";
      state: string;
      agent: string;
      tool: string;
      args: unknown;
      callId: string;
      resume: AgentResume;
      // Added after the reference by events.agent-resume-inner (HAL-3361).
      subagent?: string;
    }>();
    expectTypeOf<EventOf<"approval.resolved">>().toEqualTypeOf<{
      type: "approval.resolved";
      state: string;
      agent: string;
      tool: string;
      callId: string;
      approved: boolean;
      comment?: string;
      // Added after the reference by events.approval-resolved-by (HAL-1525).
      by?: ApprovalResolver;
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
      // "cant-try" added after the reference by events.run-cant-try (HAL-4285).
      status: "completed" | "failed" | "cant-try";
      error?: string;
      // Added after the reference by events.workflow-finished-context (HAL-1537).
      context?: Record<string, unknown>;
    }>();
  });

  typeTest("keeps the shared types the events use", () => {
    expectTypeOf<RunKind>().toEqualTypeOf<"run" | "test">();
    expectTypeOf<Usage>().toEqualTypeOf<{
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      cacheWrite1hTokens?: number;
    }>();
    expectTypeOf<RunTrigger>().toEqualTypeOf<{
      type: "manual" | "schedule" | "every" | "mail" | "signal";
      routineId?: string;
      at: string;
      messageId?: string;
      signalId?: string;
      // Added after the reference by events.trigger-catch-up (HAL-2524).
      catchUp?: { skipped: number; countIsMinimum?: true };
    }>();
    expectTypeOf<RunParent>().toEqualTypeOf<{ runId: string; state: string; depth: number }>();
    expectTypeOf<AgentResume>().toEqualTypeOf<{
      messages: unknown[];
      calls: { id: string; name: string; arguments: Record<string, unknown> }[];
      step: number;
      // Added after the reference by events.agent-resume-inner (HAL-3361).
      inner?: { agent: string; resume: AgentResume };
    }>();
  });
});
