import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { ActionParameterValue, ActionRequester } from "./action-events.ts";
import type { RunEventBody, RunEventType } from "./run-event.ts";

type Requested = Extract<RunEventBody, { type: "action.requested" }>;

verifies("events.action-requested-run-event", () => {
  typeTest("has the action event's fields but its own at", () => {
    expectTypeOf<Requested>().toEqualTypeOf<{
      type: "action.requested";
      request: string;
      definition: string;
      version: number;
      parameters: Readonly<Record<string, ActionParameterValue>>;
      requester: ActionRequester;
      reason: string;
      expires: string;
      expect?: Readonly<Record<string, ActionParameterValue>>;
    }>();
  });

  typeTest("keeps the record's events out of the run log", () => {
    expectTypeOf<"action.reviewed">().not.toExtend<RunEventType>();
    expectTypeOf<"action.finished">().not.toExtend<RunEventType>();
  });
});
