// The check before a call in a chat turn (HAL-5201): the same rules as a
// run's model call (`checkRunToolCall`), except that nothing in a chat can
// wait for a person, so a call that would ask one is refused instead. A
// chat in a harness refuses its approvals the same way.

import type { ToolCall } from "@halonicjs/ports";
import type { CallCheck } from "./check-call-before-run.ts";
import { checkRunToolCall } from "./check-run-tool-call.ts";
import type { TurnTool } from "./turn-tools.ts";

/** Why a chat turn refused a call that needs a person's OK, for the turn's `refusals`. */
export const chatApprovalReason =
  "A chat can't wait for a person's approval, so the call was refused.";

/**
 * Checks a call in a chat turn as {@link checkRunToolCall} does, and refuses
 * the calls it would ask a person about: a connector's tool that can change
 * things (`write` or `send`, and every listed tool without a risk) never
 * runs in a chat. The model gets the reason as the call's result.
 */
export function checkChatToolCall(tool: TurnTool, call: ToolCall): CallCheck {
  const check = checkRunToolCall(tool, call);
  return check.kind === "ask" ? { kind: "refused", reason: chatApprovalReason } : check;
}
