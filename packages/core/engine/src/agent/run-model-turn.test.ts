import { fenceUntrusted } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  textAnswer,
} from "../testing/scripted-model.ts";
import {
  callerTool,
  halonicTool,
  MemoryTurnLog,
  runTestTurn,
} from "./turn-test-kit.test-helper.ts";

verifies("engine.turn-runs-tool-calls", () => {
  it("runs a server's tool and asks the model again with its result", async () => {
    const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
    const { model, result } = await runTestTurn({
      answers: [callAnswer(call("c1", "lookup", { q: "acme" })), textAnswer("Found it")],
      connectors: [mail],
    });

    expect(mail.calls).toEqual([{ name: "lookup", args: { q: "acme" } }]);
    expect(model.requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      toolCallId: "c1",
      name: "lookup",
      content: fenceUntrusted("lookup done"),
    });
    expect(result.content).toBe("Found it");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(result.turn.map((message) => message.role)).toEqual(["assistant", "tool", "assistant"]);
  });

  it("offers the caller's tools, then Halonic's, then the servers'", async () => {
    const { model } = await runTestTurn({
      answers: [textAnswer("Hello")],
      callerTools: [callerTool("pick")],
      halonicTools: [halonicTool("remember", async () => "ok")],
      connectors: [new ScriptedConnector("mail", [listedTool("lookup")])],
    });

    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual([
      "pick",
      "remember",
      "lookup",
    ]);
  });

  it("runs a Halonic tool with the model's arguments", async () => {
    const seen: unknown[] = [];
    const remember = halonicTool("remember", async (args) => {
      seen.push(args);
      return "remembered";
    });
    const { result } = await runTestTurn({
      answers: [callAnswer(call("c1", "remember", { note: "pay Acme" })), textAnswer("Done")],
      halonicTools: [remember],
    });

    expect(seen).toEqual([{ note: "pay Acme" }]);
    expect(result.turn[1]).toMatchObject({ role: "tool", content: "remembered" });
  });
});

verifies("engine.turn-caller-tools-return", () => {
  it("hands a call to the caller's tool back without running it", async () => {
    const { model, result } = await runTestTurn({
      answers: [callAnswer(call("c1", "pick", { id: 3 }))],
      callerTools: [callerTool("pick")],
    });

    expect(model.requests).toHaveLength(1);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([call("c1", "pick", { id: 3 })]);
    expect(result.turn).toEqual([
      { role: "assistant", content: "", toolCalls: [call("c1", "pick", { id: 3 })] },
    ]);
  });

  it("runs its own calls from the same answer first and returns only the caller's", async () => {
    const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
    const { model, result } = await runTestTurn({
      answers: [callAnswer(call("c1", "pick"), call("c2", "lookup"))],
      callerTools: [callerTool("pick")],
      connectors: [mail],
    });

    expect(model.requests).toHaveLength(1);
    expect(mail.calls).toEqual([{ name: "lookup", args: {} }]);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([call("c1", "pick")]);
    expect(result.turn).toEqual([
      { role: "assistant", content: "", toolCalls: [call("c1", "pick"), call("c2", "lookup")] },
      { role: "tool", toolCallId: "c2", name: "lookup", content: fenceUntrusted("lookup done") },
    ]);
  });
});

verifies("engine.turn-round-limit", () => {
  it("ends with the text, no calls and a refusal for each dropped call", async () => {
    const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
    const lastAnswer = {
      ...callAnswer(call("c2", "lookup")),
      content: "Still looking",
      replay: { type: "scripted", data: ["c2"] },
    };
    const { model, result } = await runTestTurn({
      answers: [callAnswer(call("c1", "lookup")), lastAnswer],
      connectors: [mail],
      maxRounds: 2,
    });

    expect(model.requests).toHaveLength(2);
    expect(mail.calls).toHaveLength(1);
    expect(result.finishReason).toBe("length");
    expect(result.toolCalls).toEqual([]);
    expect(result.content).toBe("Still looking");
    expect(result.replay).toBeUndefined();
    expect(result.turn.at(-1)).toEqual({ role: "assistant", content: "Still looking" });
    expect(result.refusals).toEqual([
      {
        source: "mail",
        name: "lookup",
        refused: "call",
        reason: "the turn reached its limit of 2 model calls before it could run",
      },
    ]);
  });
});

verifies("engine.turn-logs-events", () => {
  it("writes the model calls and the tool call in order", async () => {
    const log = new MemoryTurnLog();
    await runTestTurn({
      answers: [callAnswer(call("c1", "lookup", { q: "acme" })), textAnswer("Found it")],
      connectors: [new ScriptedConnector("mail", [listedTool("lookup")])],
      log,
    });

    const usage = { inputTokens: 10, outputTokens: 5 };
    const model = { agent: "clerk", provider: "scripted", model: "scripted-1" };
    expect(log.events).toEqual([
      // The first message is the notice that a server wrote the fenced tool texts.
      { type: "llm.request", ...model, messages: 2 },
      { type: "llm.response", ...model, usage, latencyMs: 250, text: "" },
      { type: "tool.called", agent: "clerk", tool: "lookup", args: { q: "acme" } },
      { type: "tool.result", agent: "clerk", tool: "lookup", result: "lookup done", outcome: "ok" },
      { type: "llm.request", ...model, messages: 4 },
      { type: "llm.response", ...model, usage, latencyMs: 250, text: "Found it" },
    ]);
  });

  it("writes one tool.refused and no tool.called for a call to a tool it didn't offer", async () => {
    const log = new MemoryTurnLog();
    await runTestTurn({
      answers: [callAnswer(call("c1", "delete_everything")), textAnswer("Sorry")],
      log,
    });

    expect(log.events.map((event) => event.type)).toEqual([
      "llm.request",
      "llm.response",
      "tool.refused",
      "llm.request",
      "llm.response",
    ]);
    expect(log.events[2]).toEqual({
      type: "tool.refused",
      agent: "clerk",
      tool: "delete_everything",
      toolCallId: "c1",
      reason: "not-offered",
    });
  });

  it("writes the refused tool's name as the model wrote it", async () => {
    const log = new MemoryTurnLog();
    // A zero-width space and a newline, which a cleaned-up name would lose.
    const name = `look${String.fromCharCode(0x200b)}up\n`;
    await runTestTurn({
      answers: [callAnswer(call("c1", name)), textAnswer("Sorry")],
      connectors: [new ScriptedConnector("mail", [listedTool("lookup")])],
      log,
    });

    expect(log.events.filter((event) => event.type === "tool.refused")).toEqual([
      { type: "tool.refused", agent: "clerk", tool: name, toolCallId: "c1", reason: "not-offered" },
    ]);
  });
});
