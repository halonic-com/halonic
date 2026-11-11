import type { ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { call, ScriptedConnector } from "../testing/scripted-model.ts";
import { checkRunToolCall, runToolCheckOf } from "./check-run-tool-call.ts";
import { halonicTool } from "./turn-test-kit.test-helper.ts";
import { collectTurnTools, type TurnTool } from "./turn-tools.ts";

const lookup: TurnTool = {
  kind: "halonic",
  source: "halonic",
  definition: { name: "lookup", description: "Looks up", parameters: {} },
  tool: halonicTool("lookup", async () => "found"),
};

/**
 * The `mail` connector's `search` tool, which the engine counts as `risk`.
 * Only a risk the workspace sets could make that `read`; a listing can't.
 */
function mailTool(risk: ToolRisk): TurnTool {
  return {
    kind: "server",
    source: "mail",
    definition: { name: "mail__search", description: "Searches", parameters: {} },
    listedName: "search",
    connector: new ScriptedConnector("mail", []),
    risk,
  };
}

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

  it("runs a call to a connector's tool the engine counts as only reading", () => {
    expect(checkRunToolCall(mailTool("read"), call("c-1", "mail__search"))).toEqual({
      kind: "run",
    });
  });

  it("asks a person about a connector's tool whose listing says it only reads, because a server can't lower its risk", async () => {
    const mail = new ScriptedConnector("mail", [
      { name: "send_mail", description: "Sends", parameters: {}, risk: "read" },
      { name: "forward", description: "Forwards", parameters: {}, risk: "send" },
      { name: "label", description: "Labels", parameters: {} },
    ]);
    const { tools } = await collectTurnTools({
      callerTools: [],
      halonicTools: [],
      connectors: [mail],
    });

    expect(tools.map((tool) => (tool.kind === "server" ? tool.risk : null))).toEqual([
      "write",
      "send",
      "write",
    ]);
    for (const tool of tools) {
      expect(checkRunToolCall(tool, call("c-1", tool.definition.name))).toEqual({ kind: "ask" });
    }
  });

  it("asks a person about a connector's tool the engine counts as changing things", () => {
    expect(checkRunToolCall(mailTool("send"), call("c-1", "mail__search"))).toEqual({
      kind: "ask",
    });
    expect(checkRunToolCall(mailTool("write"), call("c-1", "mail__search"))).toEqual({
      kind: "ask",
    });
  });
});

verifies("engine.run-connector-approve", () => {
  it("asks about a call under approve by the name the server lists, not the offered one", () => {
    const check = runToolCheckOf({ mail: { approve: ["search"] } });
    expect(check(mailTool("read"), call("c-1", "mail__search"))).toEqual({ kind: "ask" });
    const byOfferedName = runToolCheckOf({ mail: { approve: ["mail__search"] } });
    expect(byOfferedName(mailTool("read"), call("c-1", "mail__search"))).toEqual({ kind: "run" });
  });

  it("refuses a call the run's check refuses rather than asking about it", () => {
    const odd = {
      id: "c-1",
      name: "mail__search",
      arguments: [] as unknown as Record<string, unknown>,
    };
    expect(runToolCheckOf({ mail: { approve: "all" } })(mailTool("read"), odd)).toMatchObject({
      kind: "refused",
    });
  });

  it("leaves Halonic's tools and connectors with no lists to the run's check", () => {
    const check = runToolCheckOf({ other: { approve: "all" } });
    expect(check(lookup, call("c-1", "lookup"))).toEqual({ kind: "run" });
    expect(check(mailTool("read"), call("c-1", "mail__search"))).toEqual({ kind: "run" });
  });
});
