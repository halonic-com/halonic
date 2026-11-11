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
import { type Connector, needsApproval } from "@halonicjs/format";
import type { ToolCall } from "@halonicjs/ports";
import type { CallCheck, CallChecker } from "./check-call-before-run.ts";
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

/**
 * {@link checkRunToolCall} for a run whose connectors' files have the
 * `tools` lists given, by connector id: a call it lets run to a connector's
 * tool that its file's `approve` names, under the name its server lists it
 * under, or that says `all`, asks a person first, whatever risk the server
 * lists (HAL-4554). A refusal still wins, so a person isn't asked about a
 * call that wouldn't run.
 */
export function runToolCheckOf(
  lists: Readonly<Record<string, Pick<Connector["tools"], "approve">>>,
): CallChecker {
  return (tool, call) => {
    const check = checkRunToolCall(tool, call);
    if (check.kind !== "run" || tool.kind !== "server") return check;
    const approve = Object.hasOwn(lists, tool.source) ? lists[tool.source] : undefined;
    return approve !== undefined && needsApproval(approve, tool.listedName)
      ? { kind: "ask" }
      : check;
  };
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
