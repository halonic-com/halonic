import type { ChatTurnRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatApprovalReason } from "./agent/check-chat-tool-call.ts";
import { halonicTool, secretsWith, steppingClock } from "./agent/turn-test-kit.test-helper.ts";
import { writerAgent } from "./kernel/kernel-test-kit.test-helper.ts";
import {
  FakeSource,
  fakeKnowledge,
  hit,
  sourceFile,
} from "./knowledge/knowledge-test-kit.test-helper.ts";
import { LocalExecutor } from "./local-executor.ts";
import type { LocalExecutorOptions } from "./local-executor-options.ts";
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
    secrets: secretsWith(),
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
  it("runs the turn on the resolved model with its Halonic tools", async () => {
    const model = new ScriptedModel([callAnswer(call("c1", "lookup")), textAnswer("Found it")]);
    const looked: Record<string, unknown>[] = [];
    const lookup = halonicTool("lookup", async (args) => {
      looked.push(args);
      return "INV-7";
    });
    const { executor, resolved } = executorOn(model, { halonicTools: [lookup] });

    const response = await executor.chatTurn(request);

    expect(resolved).toEqual([request]);
    expect(looked).toEqual([{}]);
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

  it("refuses a connector tool that sends, because nobody in a chat can approve it", async () => {
    const model = new ScriptedModel([callAnswer(call("c1", "send_mail")), textAnswer("Not sent")]);
    const mail = new ScriptedConnector("mail", [{ ...listedTool("send_mail"), risk: "send" }]);
    const clerk = { ...writerAgent(), id: "clerk", name: "Clerk", connectors: ["mail"] };
    const { executor } = executorOn(model, {
      connectors: [mail],
      chatAgentOf: async () => clerk,
    });

    const response = await executor.chatTurn({ ...request, agentId: "clerk" });

    expect(mail.calls).toEqual([]);
    expect(response.refusals).toEqual([
      { source: "mail", name: "send_mail", refused: "call", reason: chatApprovalReason },
    ]);
    expect(response.turn?.[1]).toMatchObject({
      role: "tool",
      toolCallId: "c1",
      content: `Refused: ${chatApprovalReason}`,
    });
  });

  it("refuses a connector tool whose listing says it only reads or gives no risk, since both count as writing", async () => {
    const model = new ScriptedModel([
      callAnswer(call("c1", "lookup"), call("c2", "archive")),
      textAnswer("Kept"),
    ]);
    const mail = new ScriptedConnector("mail", [
      { ...listedTool("lookup"), risk: "read" },
      listedTool("archive"),
    ]);
    const { executor } = executorOn(model, { connectors: [mail] });

    const response = await executor.chatTurn(request);

    expect(mail.calls).toEqual([]);
    expect((response.refusals ?? []).map((refusal) => refusal.name)).toEqual(["lookup", "archive"]);
  });

  it("refuses a read tool that its connector file puts under approve, or under all", async () => {
    for (const approve of [["lookup"], "all" as const]) {
      const model = new ScriptedModel([callAnswer(call("c1", "lookup")), textAnswer("Kept")]);
      const mail = new ScriptedConnector("mail", [{ ...listedTool("lookup"), risk: "read" }]);
      const { executor } = executorOn(model, {
        connectors: [mail],
        chatConnectorToolsOf: async () => ({ mail: { approve } }),
      });

      const response = await executor.chatTurn(request);

      expect(mail.calls).toEqual([]);
      expect(response.refusals).toEqual([
        { source: "mail", name: "lookup", refused: "call", reason: chatApprovalReason },
      ]);
    }
  });

  it("still refuses a read tool that its connector file leaves out of approve, since a listed read counts as writing", async () => {
    const model = new ScriptedModel([callAnswer(call("c1", "lookup")), textAnswer("Kept")]);
    const mail = new ScriptedConnector("mail", [{ ...listedTool("lookup"), risk: "read" }]);
    const { executor } = executorOn(model, {
      connectors: [mail],
      chatConnectorToolsOf: async () => ({ mail: { approve: ["archive"] } }),
    });

    const response = await executor.chatTurn(request);

    expect(mail.calls).toEqual([]);
    expect((response.refusals ?? []).map((refusal) => refusal.name)).toEqual(["lookup"]);
  });

  it("offers a chat turn only the tools its connector file allows, and no connector without a file", async () => {
    const model = new ScriptedModel([textAnswer("Hello")]);
    const mail = new ScriptedConnector("mail", [listedTool("lookup"), listedTool("archive")]);
    const tracker = new ScriptedConnector("tracker", [listedTool("search_issues")]);
    const { executor } = executorOn(model, {
      connectors: [mail, tracker],
      chatConnectorToolsOf: async () => ({ mail: { allow: ["lookup"], approve: [] } }),
    });

    await executor.chatTurn(request);

    expect((model.requests[0]?.tools ?? []).map((tool) => tool.name)).toEqual(["lookup"]);
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

  it("offers a chat turn whose agent has a file only the servers that file lists", async () => {
    const model = new ScriptedModel([textAnswer("Hello"), textAnswer("Hi")]);
    const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
    const tracker = new ScriptedConnector("tracker", [listedTool("search_issues")]);
    const clerk = { ...writerAgent(), id: "clerk", name: "Clerk", connectors: ["mail"] };
    const { executor } = executorOn(model, {
      connectors: [mail, tracker],
      chatAgentOf: async ({ agentId }) => (agentId === "clerk" ? clerk : undefined),
    });

    await executor.chatTurn({ ...request, agentId: "clerk" });
    await executor.chatTurn(request);

    const names = model.requests.map((each) => (each.tools ?? []).map((tool) => tool.name));
    expect(names).toEqual([["lookup"], ["lookup", "search_issues"]]);
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
      secrets: secretsWith(),
      clock: steppingClock(),
    });
    await expect(executor.chatTurn(request)).rejects.toThrow("no model with alias fast");
  });
});

verifies("engine.agent-knowledge", () => {
  it("offers a chat turn's agent the knowledge tools, and none without an agent", async () => {
    const model = new ScriptedModel([textAnswer("Hello"), textAnswer("Hi")]);
    const { options } = fakeKnowledge([new FakeSource("wiki", [])], [sourceFile("wiki")]);
    const { executor } = executorOn(model, { knowledge: options });

    await executor.chatTurn({ ...request, agentId: "clerk" });
    await executor.chatTurn(request);

    const names = model.requests.map((each) => (each.tools ?? []).map((tool) => tool.name));
    expect(names[0]).toEqual(expect.arrayContaining(["knowledge_search", "knowledge_read"]));
    expect(names[1]).not.toContain("knowledge_search");
  });
});

verifies("engine.knowledge-auto", () => {
  it("adds an auto source's passages to a chat turn's agent's last message, and none without an agent", async () => {
    const model = new ScriptedModel([textAnswer("Hello"), textAnswer("Hi")]);
    const wiki = new FakeSource("wiki", [hit("acme.md")], { untrusted: false });
    const { options, built } = fakeKnowledge([wiki], [sourceFile("wiki", { mode: "auto" })]);
    const { executor } = executorOn(model, { knowledge: options });

    await executor.chatTurn({ ...request, agentId: "clerk" });
    await executor.chatTurn(request);

    expect(built).toEqual([{ id: "wiki", config: { name: "wiki" }, basePath: "hubs/acme" }]);
    expect(model.requests[0]?.messages).toEqual([
      {
        role: "user",
        content:
          'Find the Acme invoice\n\nPassages from the knowledge source "wiki" that match the task best:\n\nref: "acme.md"\ntitle: Title of acme.md\nAbout acme.md',
      },
    ]);
    expect(model.requests[1]?.messages).toEqual(request.messages);
  });
});

verifies("engine.local-chat-turn", () => {
  describe("without runs", () => {
    const { executor } = executorOn(new ScriptedModel([]));
    const start = { hubId: "acme", workflowId: "reply", input: {} };

    it("rejects starts, sends and cancels", async () => {
      await expect(executor.start(start)).rejects.toThrow("runs chat turns only");
      await expect(executor.startAgent()).rejects.toThrow("can't start agent runs yet");
      await expect(executor.send("run_1", "approve")).rejects.toThrow("runs chat turns only");
      await expect(executor.cancel("run_1")).rejects.toThrow("runs chat turns only");
      await expect(
        executor.onTimer({ key: "run_1", timerId: "call:call-1", at: "" }),
      ).resolves.toBeUndefined();
    });

    it("closes a subscription with an error after it returns, never throwing", async () => {
      const closed: (Error | undefined)[] = [];
      const listener = { onEvent: () => {}, onClose: (error?: Error) => closed.push(error) };
      executor.subscribe("run_1", 0, listener);
      expect(closed).toEqual([]);
      executor.subscribe("run_2", 0, listener).close();
      await Promise.resolve();
      expect(closed.map((error) => error?.message)).toEqual([
        "This local executor runs chat turns only: it was created without `runs`.",
      ]);
    });
  });
});
