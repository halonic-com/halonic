import { ConnectorToolTimeoutError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  textAnswer,
} from "../testing/scripted-model.ts";
import { halonicTool, runTestTurn } from "./turn-test-kit.test-helper.ts";

const timedOut = () =>
  new ConnectorToolTimeoutError('The tool "search" didn\'t answer within 60 seconds.', 60_000);

verifies("engine.turn-tool-timeout", () => {
  it("notes a connector's call that ran out of time, and the turn goes on", async () => {
    const files = new ScriptedConnector("handbook-files", [listedTool("search")], () => {
      throw timedOut();
    });
    const { result } = await runTestTurn({
      answers: [callAnswer(call("c1", "search")), textAnswer("It didn't answer")],
      connectors: [files],
    });

    expect(result.toolFailures).toEqual([
      {
        toolCallId: "c1",
        reason: "tool-timeout",
        tool: "search",
        connector: "handbook-files",
        withinMs: 60_000,
      },
    ]);
    expect(result.turn[1]).toMatchObject({ role: "tool", toolCallId: "c1" });
    expect(JSON.stringify(result.turn[1])).toContain("didn't answer within 60 seconds");
    expect(result.content).toBe("It didn't answer");
  });

  it("notes nothing for a connector's tool that throws any other error", async () => {
    const files = new ScriptedConnector("handbook-files", [listedTool("search")], () => {
      throw new Error("The MCP server stopped.");
    });
    const { result } = await runTestTurn({
      answers: [callAnswer(call("c1", "search")), textAnswer("It failed")],
      connectors: [files],
    });

    expect(result.toolFailures).toEqual([]);
  });

  it("notes nothing for one of Halonic's own tools, which has no connector", async () => {
    const remember = halonicTool("remember", () => Promise.reject(timedOut()));
    const { result } = await runTestTurn({
      answers: [callAnswer(call("c1", "remember")), textAnswer("Oops")],
      halonicTools: [remember],
    });

    expect(result.toolFailures).toEqual([]);
  });
});
