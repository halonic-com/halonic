import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { ToolRefusalReason } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";

type ToolRefused = Extract<RunEventBody, { type: "tool.refused" }>;

verifies("events.tool-refused", () => {
  typeTest("names the agent, the tool as the model wrote it, the call and why", () => {
    expectTypeOf<ToolRefused>().toEqualTypeOf<{
      type: "tool.refused";
      agent: string;
      tool: string;
      toolCallId: string;
      reason: ToolRefusalReason;
    }>();
    expectTypeOf<ToolRefusalReason>().toEqualTypeOf<"not-offered">();
  });

  typeTest("doesn't accept a reason it doesn't name", () => {
    expectTypeOf<{
      type: "tool.refused";
      agent: string;
      tool: string;
      toolCallId: string;
      reason: string;
    }>().not.toExtend<ToolRefused>();
  });
});
