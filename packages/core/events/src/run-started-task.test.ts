import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { AgentSessionStart } from "./agent-started.ts";
import type { RunEventBody, RunEventType } from "./run-event.ts";
import type { RunTask } from "./run-task.ts";

// Type tests for the task a run worked on and how its agents' harness
// sessions began, which the token roll-up reads.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

const started = {
  type: "run.started",
  hubId: "acme",
  workflowId: "reply",
  input: { from: "support" },
  kind: "run",
  definitionsVersion: "sha-1",
} as const;

verifies("events.run-started-task", () => {
  typeTest("takes a task with or without a branch, and a run.started without one", () => {
    expectTypeOf<EventOf<"run.started">["task"]>().toEqualTypeOf<RunTask | undefined>();
    expectTypeOf({
      ...started,
      task: { id: "HAL-42", branch: "acme/HAL-42-reply" },
    } as const).toExtend<EventOf<"run.started">>();
    expectTypeOf({ ...started, task: { id: "HAL-42" } } as const).toExtend<
      EventOf<"run.started">
    >();
    expectTypeOf(started).toExtend<EventOf<"run.started">>();
  });
});

verifies("events.agent-started-session", () => {
  typeTest("takes a fresh or resumed session, and an agent.started without one", () => {
    const agentStarted = {
      type: "agent.started",
      state: "draft",
      agent: "writer",
      prompt: "Hi",
    } as const;
    expectTypeOf<EventOf<"agent.started">["session"]>().toEqualTypeOf<
      AgentSessionStart | undefined
    >();
    expectTypeOf({
      ...agentStarted,
      session: { start: "fresh", reason: "no-session" },
    } as const).toExtend<EventOf<"agent.started">>();
    expectTypeOf({ ...agentStarted, session: { start: "resumed" } } as const).toExtend<
      EventOf<"agent.started">
    >();
    expectTypeOf(agentStarted).toExtend<EventOf<"agent.started">>();
    expectTypeOf({ start: "fresh" } as const).not.toExtend<AgentSessionStart>();
  });
});
