// Step two of three the HAL-803 rules plug into (HAL-998): a tool call is
// checked before it runs. Every call runs for now; HAL-998 calls
// `checkToolCall` from `@halonicjs/app` here, and turns its `ask` into a
// refusal, because nothing outside a run can wait for a person.

import type { ToolCall } from "@halonicjs/ports";
import type { TurnTool } from "./turn-tools.ts";

/** What the turn does with one call. */
export type CallCheck =
  | { readonly kind: "run" }
  /** Don't run it. The reason goes to the model as the call's result, and into the refusals. */
  | { readonly kind: "refused"; readonly reason: string };

/** Checks a call to a tool the turn runs itself. */
export function checkCallBeforeRun(_tool: TurnTool, _call: ToolCall): CallCheck {
  return { kind: "run" };
}
