// Checks a connector call made outside a run, such as a tool the model calls
// from Studio's chat, as `app.outside-run-connector-gate` asks. The host
// runs this before every such call (`server.outside-run-connector-gate`), so
// a served Studio can't reach a connector past the checks a run applies.

import type { ConnectionKey } from "@halonicjs/ports";
import type { SendingSettings } from "./connection-settings.ts";
import { checkToolCall } from "./tool-call-check.ts";
import type { OfferedTool } from "./tool-listing.ts";

/** One connector call from outside a run. */
export interface OutsideRunCall {
  /** The connector the call goes to, for its settings. */
  readonly connection: ConnectionKey;
  /** The `tools` lists of the connector's file, as the format read them. */
  readonly lists: {
    /** Only these tools are offered. Absent means every tool. */
    readonly allow?: readonly string[];
    /** Calls to these tools wait for a person, which only a run can do. */
    readonly approve: readonly string[];
  };
  /** The tool as it was offered to the model. */
  readonly tool: OfferedTool;
  /** The arguments the model sent, unchecked. */
  readonly args: unknown;
}

/** What the host does with a call from outside a run. There is no "ask": nothing can wait there. */
export type OutsideRunCheck =
  /** Run it now. */
  | { readonly kind: "run" }
  /** Don't run it. The reason goes back to the caller as the call's result. */
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Checks a call from outside a run with the same rules a run applies, and
 * refuses every call that would need a person's approval, because outside
 * a run no one can give it. In order, a call is refused when:
 *
 * 1. the connector's `allow` list leaves the tool out;
 * 2. the tool is under `approve`;
 * 3. the tool is labelled `send` and sending is off for the connector;
 * 4. {@link checkToolCall} refuses it, or would ask a person first, as it
 *    does for every tool whose risk isn't `read`.
 *
 * So a `send` tool never runs here. The sending setting is still checked
 * first, so the reason names the switch the person would look for. The
 * gate gets only the read side of the settings, so it can't change them.
 *
 * @example
 * const check = await checkOutsideRunCall({ connection, lists: connector.tools, tool, args }, settings);
 * if (check.kind === "refused") return { error: check.reason };
 */
export async function checkOutsideRunCall(
  call: OutsideRunCall,
  settings: SendingSettings,
): Promise<OutsideRunCheck> {
  const name = nameInFile(call.tool);
  if (call.lists.allow !== undefined && !call.lists.allow.includes(name)) {
    return refused(`${call.tool.name} isn't in the connector's allow list`);
  }
  if (call.lists.approve.includes(name)) {
    return refused(`${call.tool.name} needs a person's approval, so it runs only in a run`);
  }
  if (call.tool.risk === "send") {
    const sending = await settings.checkSending(call.connection);
    if (!sending.allowed) {
      return refused(sending.reason);
    }
  }
  const check = checkToolCall(call.tool, call.args);
  if (check.kind === "refused") {
    return check;
  }
  if (check.kind === "ask") {
    return refused(
      `${call.tool.name} can change things (risk ${call.tool.risk}), so it runs only in a run, where a person can approve it`,
    );
  }
  return { kind: "run" };
}

/**
 * The name the connector's file uses for a tool: the name its server lists
 * it under, without the source's id in front.
 */
function nameInFile(tool: OfferedTool): string {
  return tool.kind === "listed" ? tool.listedName : tool.name;
}

function refused(reason: string): OutsideRunCheck {
  return { kind: "refused", reason };
}
