// The check before a call in a chat turn (HAL-5201): the same rules as a
// run's model call (`checkRunToolCall`), except that nothing in a chat can
// wait for a person, so a call that would ask one is refused instead. A
// chat in a harness refuses its approvals the same way.

import type { Connector } from "@halonicjs/format";
import type { ToolCall } from "@halonicjs/ports";
import type { CallCheck, CallChecker } from "./check-call-before-run.ts";
import { checkRunToolCall, runToolCheckOf } from "./check-run-tool-call.ts";
import type { TurnTool } from "./turn-tools.ts";

/** Why a chat turn refused a call that needs a person's OK, for the turn's `refusals`. */
export const chatApprovalReason =
  "A chat can't wait for a person's approval, so the call was refused.";

/**
 * Checks a call in a chat turn as {@link checkRunToolCall} does, and refuses
 * the calls it would ask a person about: a connector's tool that can change
 * things (`write` or `send`, which is every connector tool until a workspace
 * can mark one `read`, see `countedRisk`) never runs in a chat. The model
 * gets the reason as the call's result.
 */
export function checkChatToolCall(tool: TurnTool, call: ToolCall): CallCheck {
  const check = checkRunToolCall(tool, call);
  return check.kind === "ask" ? { kind: "refused", reason: chatApprovalReason } : check;
}

/**
 * {@link checkChatToolCall} for a chat whose connectors' files have the
 * `tools` lists given, by connector id: a call to a tool that a file's
 * `approve` names, or that says `all`, is refused too, whatever risk its
 * server lists (HAL-5503), as a run asks a person about it.
 */
export function chatToolCheckOf(
  lists: Readonly<Record<string, Pick<Connector["tools"], "approve">>>,
): CallChecker {
  const check = runToolCheckOf(lists);
  return (tool, call) => {
    const result = check(tool, call);
    return result.kind === "ask" ? { kind: "refused", reason: chatApprovalReason } : result;
  };
}
