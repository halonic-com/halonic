import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { ConnectorPartOffReason } from "./connector-part-off.ts";
import type { RunEventBody } from "./run-event.ts";

type PartOff = Extract<RunEventBody, { type: "connector.part-off" }>;

verifies("events.connector-part-off", () => {
  typeTest("names the agent, the connector, the part and why it is off", () => {
    expectTypeOf<PartOff>().toEqualTypeOf<{
      type: "connector.part-off";
      agent: string;
      connector: string;
      part: string;
      reason: ConnectorPartOffReason;
    }>();
  });

  typeTest("has a code for each reason a part can be off", () => {
    expectTypeOf<ConnectorPartOffReason>().toEqualTypeOf<
      | "needs-desktop-app"
      | "sandbox-unavailable"
      | "sandbox-not-fenced"
      | "network-needs-srt"
      | "settings-not-set"
      | "not-trusted"
      | "failed"
    >();
  });

  typeTest("doesn't accept free text as the reason", () => {
    expectTypeOf<{
      type: "connector.part-off";
      agent: string;
      connector: string;
      part: string;
      reason: "exited with code 1";
    }>().not.toExtend<PartOff>();
  });
});
