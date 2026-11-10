import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody, RunEventType } from "./run-event.ts";

// Type tests for the harness a whole run runs its task agents in, as
// `halonic run --harness` asks for it.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

verifies("events.run-started-harness", () => {
  typeTest("takes the harness of a whole run, and a run.started without one", () => {
    expectTypeOf<EventOf<"run.started">["harness"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf({
      type: "run.started",
      hubId: "acme",
      workflowId: "reply",
      input: { from: "support" },
      kind: "run",
      definitionsVersion: "sha-1",
      harness: "codex",
    } as const).toExtend<EventOf<"run.started">>();
    expectTypeOf({
      type: "run.started",
      hubId: "acme",
      workflowId: "reply",
      input: { from: "support" },
      kind: "run",
      definitionsVersion: "sha-1",
    } as const).toExtend<EventOf<"run.started">>();
  });
});
