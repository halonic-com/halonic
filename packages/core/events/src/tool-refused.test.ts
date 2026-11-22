import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import type { ToolRefusalReason } from "./tool-refused.ts";

type ToolRefused = Extract<RunEventBody, { type: "tool.refused" }>;

/** The fields every `tool.refused` has. */
interface Named {
  type: "tool.refused";
  agent: string;
  tool: string;
  toolCallId: string;
}

verifies("events.tool-refused", () => {
  typeTest("names the agent, the tool as the model wrote it, the call and why", () => {
    expectTypeOf<Extract<ToolRefused, { reason: "not-offered" }>>().toEqualTypeOf<
      Named & { reason: "not-offered" }
    >();
    expectTypeOf<ToolRefusalReason>().toEqualTypeOf<"not-offered" | "sending-off">();
  });

  typeTest("names the connector whose sending is off (HAL-15772)", () => {
    expectTypeOf<Extract<ToolRefused, { reason: "sending-off" }>>().toEqualTypeOf<
      Named & { reason: "sending-off"; connector: string }
    >();
    expectTypeOf<Named & { reason: "sending-off" }>().not.toExtend<ToolRefused>();
  });

  typeTest("doesn't accept a reason it doesn't name", () => {
    expectTypeOf<Named & { reason: string }>().not.toExtend<ToolRefused>();
  });
});
