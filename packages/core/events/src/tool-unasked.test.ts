import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { ToolUnaskedReason } from "./run-basics.ts";
import type { RunEventBody } from "./run-event.ts";

type ToolUnasked = Extract<RunEventBody, { type: "tool.unasked" }>;

verifies("events.tool-unasked", () => {
  typeTest("names the agent, the connector, the tool as the model called it and why", () => {
    expectTypeOf<ToolUnasked>().toEqualTypeOf<{
      type: "tool.unasked";
      agent: string;
      connector: string;
      tool: string;
      reason: ToolUnaskedReason;
    }>();
    expectTypeOf<ToolUnaskedReason>().toEqualTypeOf<"read-list">();
  });

  typeTest("doesn't accept a reason it doesn't name", () => {
    expectTypeOf<{
      type: "tool.unasked";
      agent: string;
      connector: string;
      tool: string;
      reason: string;
    }>().not.toExtend<ToolUnasked>();
  });
});
