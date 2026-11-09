import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunFailureReason } from "./run-basics.ts";
import type { RunEventBody, RunEventType } from "./run-event.ts";

// Type tests for why a run failed and for the waits a step logs before it
// calls out. `tsc -p tsconfig.test.json` fails if a reason or a field changes.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

/** True when `Reason` is one of the run failure reasons. */
type IsReason<Reason extends string> = Reason extends RunFailureReason ? true : false;

verifies("events.run-failed-reason", () => {
  typeTest("says why a run failed, from exactly this list", () => {
    expectTypeOf<RunFailureReason>().toEqualTypeOf<
      | "budget"
      | "cancelled"
      | "model-missing"
      | "model-no-tools"
      | "error"
      | "model-unreachable"
      | "model-out-of-memory"
      | "disk-full"
      | "interrupted"
      | "sandbox-start-failed"
      | "harness-start-failed"
    >();
    expectTypeOf<EventOf<"run.failed">["reason"]>().toEqualTypeOf<RunFailureReason | undefined>();
  });

  typeTest("still accepts a run.failed event without a reason, as older logs have", () => {
    expectTypeOf<{
      type: "run.failed";
      state: null;
      error: string;
    }>().toExtend<EventOf<"run.failed">>();
  });
});

verifies("events.run-failed-model-unreachable", () => {
  typeTest("names the host that didn't answer", () => {
    expectTypeOf<IsReason<"model-unreachable">>().toEqualTypeOf<true>();
    expectTypeOf<EventOf<"run.failed">["host"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "model-unreachable";
      host: string;
    }>().toExtend<EventOf<"run.failed">>();
  });
});

verifies("events.run-failed-model-out-of-memory", () => {
  typeTest("has a reason for a model that ran out of memory", () => {
    expectTypeOf<IsReason<"model-out-of-memory">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-disk-full", () => {
  typeTest("has a reason for a full disk", () => {
    expectTypeOf<IsReason<"disk-full">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-interrupted", () => {
  typeTest("has a reason for a run the engine stopped in the middle of", () => {
    expectTypeOf<IsReason<"interrupted">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-sandbox-start-failed", () => {
  typeTest("has a reason for a sandbox that didn't start for this run", () => {
    expectTypeOf<IsReason<"sandbox-start-failed">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-harness-start-failed", () => {
  typeTest("has a reason for a harness that didn't start", () => {
    expectTypeOf<IsReason<"harness-start-failed">>().toEqualTypeOf<true>();
  });
});

verifies("events.connector-started", () => {
  typeTest("names the step, the agent, the connector and the time limit", () => {
    expectTypeOf<EventOf<"connector.started">>().toEqualTypeOf<{
      type: "connector.started";
      state: string;
      agent: string;
      connector: string;
      timeoutMs: number;
    }>();
  });

  typeTest("doesn't accept the event without a time limit", () => {
    expectTypeOf<{
      type: "connector.started";
      state: string;
      agent: string;
      connector: string;
    }>().not.toExtend<EventOf<"connector.started">>();
  });
});
