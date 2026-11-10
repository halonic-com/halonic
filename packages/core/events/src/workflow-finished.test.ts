import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody, RunEventType } from "./run-event.ts";

// Type tests for the child's context on workflow.finished: a for-each item's
// result travels in the parent's log on its own workflow.finished.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

verifies("events.workflow-finished-context", () => {
  typeTest("takes a finished item's child context, and a workflow.finished without one", () => {
    expectTypeOf<EventOf<"workflow.finished">["context"]>().toEqualTypeOf<
      Record<string, unknown> | undefined
    >();
    expectTypeOf({
      type: "workflow.finished",
      state: "triage",
      workflow: "label-email",
      childRunId: "r-acme.2.0",
      status: "completed",
      context: { label: "refunds" },
    } as const).toExtend<EventOf<"workflow.finished">>();
    expectTypeOf({
      type: "workflow.finished",
      state: "check",
      workflow: "approval",
      childRunId: "r-acme.2",
      status: "completed",
    } as const).toExtend<EventOf<"workflow.finished">>();
  });
});
