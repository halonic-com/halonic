// The check before a call in a workflow run's model call (HAL-3331): every
// call goes through `checkToolCall`, the same rules a host applies to calls
// from outside a run, so a refusal reaches the model as the call's result.

import { checkToolCall, type OfferedDeclaredTool } from "@halonicjs/app";
import type { ToolCall } from "@halonicjs/ports";
import type { CallCheck } from "./check-call-before-run.ts";
import type { HalonicTool, TurnTool } from "./turn-tools.ts";

/**
 * Checks a call in a run's model call with `checkToolCall`. Only Halonic's
 * own tools run in a run for now: a connector's call is refused, because
 * a run must not reach a connector before the sending check, the
 * idempotency key and the effect-requested record exist (HAL-186 step 4c).
 * A call that needs a person's OK gives `ask`, and the turn stops there.
 */
export function checkRunToolCall(tool: TurnTool, call: ToolCall): CallCheck {
  if (tool.kind !== "halonic") {
    return refused(`${tool.source}'s tools don't run in workflow runs yet`);
  }
  return checkToolCall(offeredTool(tool.tool), call.arguments);
}

/**
 * A Halonic tool as `checkToolCall` reads it: declared, because Halonic
 * wrote and reviewed it, so its arguments are checked at every level.
 */
function offeredTool(tool: HalonicTool): OfferedDeclaredTool {
  const { name, description, parameters } = tool.definition;
  return {
    kind: "declared",
    name,
    description,
    parameters,
    risk: tool.risk ?? "read",
    untrusted: false,
  };
}

function refused(reason: string): CallCheck {
  return { kind: "refused", reason };
}
