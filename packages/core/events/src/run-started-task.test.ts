import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody, RunEventType } from "./run-event.ts";
import type { RunTask } from "./run-task.ts";

// Type tests for the task a run worked on, which the token roll-up reads.

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
