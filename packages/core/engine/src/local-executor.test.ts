import type { ChatTurnRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { halonicTool, steppingClock } from "./agent/turn-test-kit.test-helper.ts";
import { LocalExecutor, type LocalExecutorOptions } from "./local-executor.ts";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  ScriptedModel,
  textAnswer,
} from "./testing/scripted-model.ts";

function executorOn(model: ScriptedModel, options: Partial<LocalExecutorOptions> = {}) {
  const resolved: ChatTurnRequest[] = [];
  const executor = new LocalExecutor({
    resolveModel: async (request) => {
      resolved.push(request);
      return { provider: model, model: "scripted-1" };
    },
    halonicTools: [],
    connectors: [],
    clock: steppingClock(),
    ...options,
  });
  return { executor, resolved };
}

const request: ChatTurnRequest = {
  hubId: "acme",
  alias: "fast",
  messages: [{ role: "user", content: "Find the Acme invoice" }],
  tools: [],
};

verifies("engine.local-chat-turn", () => {
  it("runs the turn on the resolved model with its servers' tools", async () => {
    const model = new ScriptedModel([callAnswer(call("c1", "lookup")), textAnswer("Found it")]);
    const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
    const { executor, resolved } = executorOn(model, { connectors: [mail] });

    const response = await executor.chatTurn(request);

    expect(resolved).toEqual([request]);
    expect(mail.calls).toEqual([{ name: "lookup", args: {} }]);
    expect(response).toMatchObject({
      model: "scripted-1",
      content: "Found it",
      finishReason: "stop",
      refusals: [],
    });
    expect(response.turn?.map((message) => message.role)).toEqual([
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(model.requests[0]?.meta).toEqual({ agentId: "chat" });
  });

  it("offers its Halonic tools after the caller's and names the request's agent", async () => {
    const model = new ScriptedModel([textAnswer("Hello")]);
    const remember = halonicTool("remember", async () => "kept");
    const { executor } = executorOn(model, { halonicTools: [remember] });
    const pick = { name: "pick", description: "Picks", parameters: {} };

    await executor.chatTurn({
      ...request,
      tools: [pick],
      agentId: "clerk",
      params: { temperature: 0 },
    });

    expect(model.requests[0]?.tools?.map((tool) => tool.name)).toEqual(["pick", "remember"]);
    expect(model.requests[0]?.params).toEqual({ temperature: 0 });
    expect(model.requests[0]?.meta).toEqual({ agentId: "clerk" });
  });

  it("stops at 20 model calls unless told otherwise", async () => {
    const lookupForever = Array.from({ length: 21 }, (_, index) =>
      callAnswer(call(`c${index}`, "lookup")),
    );
    const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
    const byDefault = await executorOn(new ScriptedModel(lookupForever), {
      connectors: [mail],
    }).executor.chatTurn(request);
    const twice = await executorOn(new ScriptedModel(lookupForever), {
      connectors: [mail],
      maxRounds: 2,
    }).executor.chatTurn(request);

    expect(byDefault.finishReason).toBe("length");
    expect(byDefault.usage.inputTokens).toBe(200);
    expect(twice.usage.inputTokens).toBe(20);
  });

  it("refuses a round limit below 1", () => {
    const model = new ScriptedModel([]);
    expect(() => executorOn(model, { maxRounds: 0 })).toThrow(RangeError);
    expect(() => executorOn(model, { maxRounds: 1.5 })).toThrow(RangeError);
  });

  it("rejects with the resolver's error when no model fits", async () => {
    const executor = new LocalExecutor({
      resolveModel: () => Promise.reject(new Error("no model with alias fast")),
      halonicTools: [],
      connectors: [],
      clock: steppingClock(),
    });
    await expect(executor.chatTurn(request)).rejects.toThrow("no model with alias fast");
  });

  describe("runs, which the kernel adds later", () => {
    const { executor } = executorOn(new ScriptedModel([]));

    it("rejects starts and sends", async () => {
      await expect(executor.start()).rejects.toThrow("can't start runs yet");
      await expect(executor.startAgent()).rejects.toThrow("can't startAgent runs yet");
      await expect(executor.send()).rejects.toThrow("can't send runs yet");
    });

    it("closes a subscription with an error after it returns, never throwing", async () => {
      const closed: (Error | undefined)[] = [];
      const listener = { onEvent: () => {}, onClose: (error?: Error) => closed.push(error) };
      executor.subscribe("run_1", 0, listener);
      expect(closed).toEqual([]);
      executor.subscribe("run_2", 0, listener).close();
      await Promise.resolve();
      expect(closed.map((error) => error?.message)).toEqual([
        "The local executor can't subscribe runs yet; it only runs chat turns for now.",
      ]);
    });
  });
});
