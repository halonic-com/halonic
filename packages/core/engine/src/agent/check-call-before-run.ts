// Step two of three the HAL-803 rules plug into (HAL-998): a tool call is
// checked before it runs. A workflow run's model call checks every call
// with `checkRunToolCall`. A chat turn still runs every call; HAL-998 calls
// `checkToolCall` from `@halonicjs/app` here, and turns its `ask` into a
// refusal, because nothing outside a run can wait for a person.

import type { ToolCall } from "@halonicjs/ports";
import type { TurnTool } from "./turn-tools.ts";

/** What the turn does with one call. */
export type CallCheck =
  | { readonly kind: "run" }
  /** Don't run it. The reason goes to the model as the call's result, and into the refusals. */
  | { readonly kind: "refused"; readonly reason: string };

/** Checks a call to a tool the turn runs itself, before it runs. */
export type CallChecker = (tool: TurnTool, call: ToolCall) => CallCheck;

/** The check of a chat turn: every call runs, until HAL-998. */
export const checkCallBeforeRun: CallChecker = () => ({ kind: "run" });
