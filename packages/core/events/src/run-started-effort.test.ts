import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody, RunEventType } from "./run-event.ts";

// Type tests for the effort a whole run's harness agents think with.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

const started = {
  type: "run.started",
  hubId: "acme",
  workflowId: "reply",
  input: { from: "support" },
  kind: "run",
  definitionsVersion: "sha-1",
} as const;

verifies("events.run-started-effort", () => {
  typeTest("takes the low effort of a whole run, and a run.started without one", () => {
    expectTypeOf<EventOf<"run.started">["effort"]>().toEqualTypeOf<"low" | undefined>();
    expectTypeOf({ ...started, effort: "low" } as const).toExtend<EventOf<"run.started">>();
    expectTypeOf(started).toExtend<EventOf<"run.started">>();
  });

  typeTest("refuses any other effort", () => {
    expectTypeOf({ ...started, effort: "high" } as const).not.toExtend<EventOf<"run.started">>();
  });
});
