// Step two of three the HAL-803 rules plug into (HAL-998): a tool call is
// checked before it runs. A workflow run's model call checks every call
// with `checkRunToolCall`; a chat turn with `checkChatToolCall`, which
// turns its `ask` into a refusal, because nothing outside a run can wait
// for a person.

import type { ToolCall } from "@halonicjs/ports";
import type { TurnTool } from "./turn-tools.ts";

/** What the turn does with one call. */
export type CallCheck =
  | { readonly kind: "run" }
  /** Don't run it. The reason goes to the model as the call's result, and into the refusals. */
  | { readonly kind: "refused"; readonly reason: string }
  /**
   * Ask a person first: the turn stops before the call, and goes on once
   * they answer. Only a run can wait for that, so a chat turn's check never
   * gives it.
   */
  | { readonly kind: "ask" };

/** Checks a call to a tool the turn runs itself, before it runs. */
export type CallChecker = (tool: TurnTool, call: ToolCall) => CallCheck;
