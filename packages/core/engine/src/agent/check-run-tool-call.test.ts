import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { call, ScriptedConnector } from "../testing/scripted-model.ts";
import { checkRunToolCall } from "./check-run-tool-call.ts";
import { halonicTool } from "./turn-test-kit.test-helper.ts";
import type { TurnTool } from "./turn-tools.ts";

const lookup: TurnTool = {
  kind: "halonic",
  source: "halonic",
  definition: { name: "lookup", description: "Looks up", parameters: {} },
  tool: halonicTool("lookup", async () => "found"),
};

verifies("engine.run-tool-calls", () => {
  it("runs a call to a Halonic tool whose arguments its parameters declare", () => {
    expect(checkRunToolCall(lookup, call("c-1", "lookup"))).toEqual({ kind: "run" });
  });

  it("refuses arguments that aren't an object", () => {
    const odd = { id: "c-1", name: "lookup", arguments: [] as unknown as Record<string, unknown> };
    expect(checkRunToolCall(lookup, odd)).toEqual({
      kind: "refused",
      reason: "the arguments aren't an object",
    });
  });

  it("refuses a call to a connector's tool, which runs don't reach yet", () => {
    const send: TurnTool = {
      kind: "server",
      source: "mail",
      definition: { name: "mail__send", description: "Sends", parameters: {} },
      listedName: "send",
      connector: new ScriptedConnector("mail", []),
      risk: "read",
    };
    expect(checkRunToolCall(send, call("c-1", "mail__send"))).toEqual({
      kind: "refused",
      reason: "mail's tools don't run in workflow runs yet",
    });
  });
});
