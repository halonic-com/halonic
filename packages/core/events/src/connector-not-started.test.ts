import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { ConnectorNotStartedCause } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";

type ConnectorNotStarted = Extract<RunEventBody, { type: "connector.not-started" }>;

verifies("events.connector-not-started", () => {
  typeTest("names the agent, the connector and why, in the shape of a tool result's cause", () => {
    expectTypeOf<ConnectorNotStarted>().toEqualTypeOf<{
      type: "connector.not-started";
      agent: string;
      connector: string;
      cause: ConnectorNotStartedCause;
    }>();
    expectTypeOf<ConnectorNotStartedCause>().toEqualTypeOf<{
      readonly code: "connector-not-started";
      readonly why: "program-missing" | "secret-not-set" | "other";
      readonly name?: string;
    }>();
  });

  typeTest("doesn't accept a cause of another code", () => {
    expectTypeOf<{
      type: "connector.not-started";
      agent: string;
      connector: string;
      cause: { code: "time-limit"; seconds: number };
    }>().not.toExtend<ConnectorNotStarted>();
  });
});
