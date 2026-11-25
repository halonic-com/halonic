// The check before a tool step's call (requirement `engine.tool-state`): the
// same one an agent's call to that tool gets in a run's model call, so a
// tool step can call nothing an agent couldn't, and waits for a person
// wherever an agent would.

import type { ConnectorClient } from "@halonicjs/ports";
import { runToolCheckOf } from "../agent/check-run-tool-call.ts";
import type { ListedToolApproval } from "../agent/listed-tool-approval.ts";
import type { EffectBoundary } from "../agent/run-tool-call.ts";
import { collectTurnTools, errorMessage } from "../agent/turn-tools.ts";
import type { RunDefinitions } from "../kernel/decide-types.ts";
import type { ToolCheckResult, ToolStepCall } from "../kernel/tool-step-call.ts";
import { allowedToolsOf } from "./connector-calls.ts";

/**
 * Checks a tool step's call on the run's connectors, which `open` gives. The
 * tool is looked up among those its connector's `allow` keeps, in a listing
 * that a person approved and the connector's sheet describes, as for a run's
 * model call. Then `runToolCheckOf` decides with the `tools` lists the run
 * started with: arguments outside the tool's parameters are refused, and a
 * tool the `read` list doesn't name, or the `approve` list names, asks a
 * person first. A tool labelled `send` is refused while the connector may
 * not send, so no one is asked about a call that wouldn't be made.
 */
export async function checkRunToolStep(
  open: () => Promise<readonly ConnectorClient[]>,
  definitions: Pick<RunDefinitions, "connectorTools" | "declaredTools">,
  boundary: EffectBoundary,
  call: ToolStepCall,
  listedToolApproval: ListedToolApproval,
): Promise<ToolCheckResult> {
  let connectors: readonly ConnectorClient[];
  try {
    connectors = await open();
  } catch (error) {
    return refused(`the connector "${call.connector}" isn't connected: ${errorMessage(error)}`);
  }
  const lists = definitions.connectorTools ?? {};
  const connector = allowedToolsOf(connectors, lists).find((each) => each.id === call.connector);
  if (connector === undefined) {
    return refused(`the connector "${call.connector}" isn't connected`);
  }
  const tools = await collectTurnTools({
    callerTools: [],
    halonicTools: [],
    connectors: [connector],
    connectorTools: lists,
    ...(definitions.declaredTools === undefined
      ? {}
      : { declaredTools: definitions.declaredTools }),
    listedToolApproval,
  });
  const offered = [...tools.byName].find(
    ([, tool]) => tool.kind === "server" && tool.listedName === call.tool,
  );
  if (offered === undefined)
    return refused(whyNotOffered(call, tools.waiting, tools.listingErrors));
  const [name, tool] = offered;
  const check = runToolCheckOf(lists)(tool, { id: call.callId, name, arguments: call.args });
  if (check.kind === "refused") return refused(check.reason);
  if (tool.kind === "server" && tool.risk === "send") {
    const sending = await boundary.checkSending(call.connector);
    if (!sending.allowed) return refused(sending.reason);
  }
  return { type: "tool-check", kind: check.kind, name };
}

/** Why the connector offers no tool of the call's name: its listing failed, nobody approved it, or there is none. */
function whyNotOffered(
  call: ToolStepCall,
  waiting: readonly { readonly source: string; readonly name: string }[],
  listingErrors: ReadonlyMap<string, unknown>,
): string {
  if (listingErrors.has(call.connector)) {
    return `the connector "${call.connector}" couldn't list its tools`;
  }
  if (waiting.some((each) => each.source === call.connector && each.name === call.tool)) {
    return `nobody has approved ${call.tool} of the connector "${call.connector}" yet`;
  }
  return `the connector "${call.connector}" doesn't offer ${call.tool}`;
}

function refused(reason: string): ToolCheckResult {
  return { type: "tool-check", kind: "refused", reason };
}
