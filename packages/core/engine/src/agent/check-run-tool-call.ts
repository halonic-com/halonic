// The check before a call in a workflow run's model call (HAL-3331): every
// call goes through `checkToolCall`, the same rules a host applies to calls
// from outside a run, so a refusal reaches the model as the call's result.

import {
  checkToolCall,
  type OfferedDeclaredTool,
  type OfferedListedTool,
  type OfferedTool,
  UntrustedText,
} from "@halonicjs/app";
import type { ToolCall } from "@halonicjs/ports";
import type { CallCheck } from "./check-call-before-run.ts";
import type { HalonicTool, TurnTool } from "./turn-tools.ts";

/**
 * Checks a call in a run's model call with `checkToolCall`. Halonic's own
 * tools are checked as declared tools, and a connector's tools as listed
 * ones, which a server wrote. A connector's tool reaches a run only when
 * the run makes its calls that can change things itself (HAL-1532). A call
 * that needs a person's OK gives `ask`, and the turn stops there.
 */
export function checkRunToolCall(tool: TurnTool, call: ToolCall): CallCheck {
  const offered = offeredTool(tool);
  if (offered === null) {
    return refused(`${tool.source}'s tools don't run in workflow runs`);
  }
  return checkToolCall(offered, call.arguments);
}

/** The tool as `checkToolCall` reads it, or `null` for the caller's, which a run never offers. */
function offeredTool(tool: TurnTool): OfferedTool | null {
  switch (tool.kind) {
    case "halonic":
      return declaredTool(tool.tool);
    case "server":
      return listedTool(tool);
    case "caller":
      return null;
  }
}

/**
 * Checks a call in a subagent's turn as {@link checkRunToolCall} does, but
 * refuses a call that needs a person's OK: a subagent's turn runs inside
 * its parent's tool call, so it can't stop the run to wait (HAL-3361).
 */
export function checkSubagentToolCall(tool: TurnTool, call: ToolCall): CallCheck {
  const check = checkRunToolCall(tool, call);
  return check.kind === "ask"
    ? refused(`${call.name} needs a person's OK, which a subagent can't wait for yet`)
    : check;
}

/**
 * A Halonic tool as `checkToolCall` reads it: declared, because Halonic
 * wrote and reviewed it, so its arguments are checked at every level.
 */
function declaredTool(tool: HalonicTool): OfferedDeclaredTool {
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

/**
 * A connector's tool as `checkToolCall` reads it: listed, because a server
 * wrote it, and `write` when its listing gives no risk, as the port asks.
 */
function listedTool(tool: Extract<TurnTool, { kind: "server" }>): OfferedListedTool {
  const { name, description, parameters } = tool.definition;
  return {
    kind: "listed",
    name,
    listedName: tool.listedName,
    description: new UntrustedText(description),
    parameters,
    risk: tool.risk ?? "write",
    untrusted: true,
  };
}

function refused(reason: string): CallCheck {
  return { kind: "refused", reason };
}
