import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { AgentResume } from "./agent-resume.ts";
import type {
  ApprovalResolver,
  ModelSkipReason,
  RunFailureReason,
  RunKind,
  RunParent,
  RunTrigger,
  ToolOutcome,
  Usage,
} from "./run-basics.ts";
import type { RunEvent, RunEventBase, RunEventBody, RunEventType } from "./run-event.ts";
import type { LoggedSandboxBlock } from "./sandbox-blocked.ts";
import type { SandboxOpenedView, SandboxStrength } from "./sandbox-opened.ts";

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
      // Added after the reference by events.started-events (HAL-189).
      | "sandbox.started"
      | "harness.started"
      // Added after the reference by events.sandbox-opened (HAL-1707).
      | "sandbox.opened"
      // Added after the reference by events.sandbox-blocked (HAL-189).
      | "sandbox.blocked"
      // Added after the reference by events.connector-started (HAL-1728).
      | "connector.started"
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
    expectTypeOf<EventOf<"run.failed">>().toEqualTypeOf<{
      type: "run.failed";
      state: string | null;
      error: string;
      // Added after the reference by events.run-failed-reason (HAL-1525).
      reason?: RunFailureReason;
      // Added after the reference by events.run-failed-model-unreachable (HAL-1728).
      host?: string;
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
      // Added after the reference by events.tool-call-as-text (HAL-1880).
      toolCallAsText?: true;
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
    expectTypeOf<EventOf<"tool.result">>().toEqualTypeOf<{
      type: "tool.result";
      agent: string;
      tool: string;
      result: string;
      // Added after the reference by events.tool-result-outcome (HAL-1525).
      outcome?: ToolOutcome;
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

verifies("events.tool-result-outcome", () => {
  typeTest("says how a tool call ended: ok, error or unknown", () => {
    expectTypeOf<ToolOutcome>().toEqualTypeOf<"ok" | "error" | "unknown">();
    expectTypeOf<EventOf<"tool.result">["outcome"]>().toEqualTypeOf<ToolOutcome | undefined>();
  });
});

verifies("events.approval-resolved-by", () => {
  typeTest("says who resolved an approval: a person or a rule", () => {
    expectTypeOf<ApprovalResolver>().toEqualTypeOf<"person" | "rule">();
    expectTypeOf<EventOf<"approval.resolved">["by"]>().toEqualTypeOf<
      ApprovalResolver | undefined
    >();
  });
});

verifies("events.sandbox-opened", () => {
  typeTest("records a sandboxed step's display copy of its profile and nothing else", () => {
    expectTypeOf<EventOf<"sandbox.opened">>().toEqualTypeOf<{
      type: "sandbox.opened";
      state: string;
      agent: string;
      sandbox: SandboxOpenedView;
    }>();
    expectTypeOf<SandboxOpenedView>().toEqualTypeOf<{
      strength: SandboxStrength;
      workingFolder: string;
      tempFolder: string;
      settingsFolder: string | null;
      readOnlyPaths: string[];
      deniedGroups: string[];
      deniedPaths: string[];
      allowedSites: string[];
      timeLimitMs: number;
    }>();
    expectTypeOf<SandboxStrength>().toEqualTypeOf<"os" | "vm" | "remote">();
  });
});

verifies("events.llm-skipped", () => {
  typeTest("names the skipped alias, its model, why, and the alias tried instead", () => {
    expectTypeOf<EventOf<"llm.skipped">>().toEqualTypeOf<{
      type: "llm.skipped";
      agent: string;
      alias: string;
      provider: string;
      model: string;
      reason: ModelSkipReason;
      next?: string;
    }>();
    expectTypeOf<ModelSkipReason>().toEqualTypeOf<"no-key">();
  });

  typeTest("leaves next out when no alias is left", () => {
    const last: RunEventBody = {
      type: "llm.skipped",
      agent: "writer",
      alias: "default",
      provider: "openai",
      model: "gpt-mini",
      reason: "no-key",
    };
    expectTypeOf(last).toMatchTypeOf<RunEventBody>();
  });
});

verifies("events.tool-call-as-text", () => {
  typeTest("marks an answer whose text is a tool call, and is absent otherwise", () => {
    expectTypeOf<EventOf<"llm.response">["toolCallAsText"]>().toEqualTypeOf<true | undefined>();
    // @ts-expect-error: the mark is set or absent, never false
    expectTypeOf<false>().toMatchTypeOf<EventOf<"llm.response">["toolCallAsText"]>();
  });
});

verifies("events.started-events", () => {
  typeTest("records that a step's sandbox is being opened, and how long the engine waits", () => {
    expectTypeOf<EventOf<"sandbox.started">>().toEqualTypeOf<{
      type: "sandbox.started";
      state: string;
      agent: string;
      timeoutMs: number;
    }>();
  });

  typeTest("records that a step's harness is being started, and how long the engine waits", () => {
    expectTypeOf<EventOf<"harness.started">>().toEqualTypeOf<{
      type: "harness.started";
      state: string;
      agent: string;
      harness: string;
      timeoutMs: number;
    }>();
  });
});

verifies("events.sandbox-blocked", () => {
  typeTest("records a refused access and how many accesses it stands for", () => {
    expectTypeOf<EventOf<"sandbox.blocked">>().toEqualTypeOf<{
      type: "sandbox.blocked";
      state: string;
      agent: string;
      block: LoggedSandboxBlock;
      count: number;
    }>();
  });
});
