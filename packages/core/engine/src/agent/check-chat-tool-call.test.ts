import type { ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { call, ScriptedConnector } from "../testing/scripted-model.ts";
import { chatApprovalReason, checkChatToolCall } from "./check-chat-tool-call.ts";
import { countedRisk } from "./offer-listed-tools.ts";
import { halonicTool } from "./turn-test-kit.test-helper.ts";
import type { TurnTool } from "./turn-tools.ts";

const lookup: TurnTool = {
  kind: "halonic",
  source: "halonic",
  definition: { name: "lookup", description: "Looks up", parameters: {} },
  tool: halonicTool("lookup", async () => "found"),
};

/**
 * The `mail` connector's `send` tool, listed with `listed` as its risk, or
 * without one, and counted the way `offerListedTools` counts it.
 */
function mailTool(listed: ToolRisk | undefined): TurnTool {
  return {
    kind: "server",
    source: "mail",
    definition: { name: "mail__send", description: "Sends", parameters: {} },
    listedName: "send",
    connector: new ScriptedConnector("mail", []),
    risk: countedRisk(listed, false),
    ...(listed === undefined ? {} : { listedRisk: listed }),
  };
}

const refusedForApproval = { kind: "refused", reason: chatApprovalReason };

verifies("engine.local-chat-turn", () => {
  it("runs a call to a Halonic tool", () => {
    expect(checkChatToolCall(lookup, call("c-1", "lookup"))).toEqual({ kind: "run" });
  });

  it("refuses a call a run would ask a person about, since nobody in a chat can answer", () => {
    for (const listed of ["read", "write", "send", undefined] as const) {
      expect(checkChatToolCall(mailTool(listed), call("c-1", "mail__send"))).toEqual(
        refusedForApproval,
      );
    }
  });

  it("keeps the run check's own refusal and its reason", () => {
    const extra = { id: "c-1", name: "lookup", arguments: { invoice: "A-1" } };
    expect(checkChatToolCall(lookup, extra)).toEqual({
      kind: "refused",
      reason: 'lookup has no parameter "invoice"',
    });
  });
});
