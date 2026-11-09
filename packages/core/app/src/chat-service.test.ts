import type { ChatMessage } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ChatService, type ChatSettings, type ChatTool } from "./chat-service.ts";
import {
  call,
  ScriptedChat,
  type ScriptedTurn,
  textTurn,
  toolTurn,
} from "./testing/scripted-chat.ts";

const settings: ChatSettings = { hubId: "acme", alias: "default" };
const question: ChatMessage[] = [{ role: "user", content: "What does triage do?" }];

/** A tool that answers with `answer` and records the calls it gets. */
function tool(name: string, answer: (args: Record<string, unknown>) => string = () => "ok") {
  const calls: Record<string, unknown>[] = [];
  const chatTool: ChatTool = {
    definition: { name, description: `The ${name} tool.`, parameters: { type: "object" } },
    async call(toolCall) {
      calls.push(toolCall.arguments);
      return answer(toolCall.arguments);
    },
  };
  return { chatTool, calls };
}

function setUp(turns: ScriptedTurn[]) {
  const model = new ScriptedChat(turns);
  return { model, service: new ChatService(model) };
}

verifies("app.chat-turn-loop", () => {
  it("runs the tools the model calls and asks again with their results", async () => {
    const readFile = tool("read_file", (args) => `contents of ${String(args["path"])}`);
    const { model, service } = setUp([
      toolTurn(call("c1", "read_file", { path: "triage.workflow.yaml" })),
      textTurn("It sorts mail."),
    ]);

    const answer = await service.answer({
      settings,
      messages: question,
      tools: [readFile.chatTool],
    });

    expect(answer.end).toEqual({ reason: "answered" });
    expect(answer.messages).toEqual([
      {
        role: "assistant",
        content: "",
        toolCalls: [call("c1", "read_file", { path: "triage.workflow.yaml" })],
      },
      {
        role: "tool",
        content: "contents of triage.workflow.yaml",
        toolCallId: "c1",
        name: "read_file",
      },
      { role: "assistant", content: "It sorts mail." },
    ]);
    expect(model.requests[1]?.messages).toEqual([...question, ...answer.messages.slice(0, 2)]);
  });

  it("passes the settings and tool definitions to every model turn", async () => {
    const readFile = tool("read_file");
    const { model, service } = setUp([toolTurn(call("c1", "read_file")), textTurn("Done.")]);

    await service.answer({
      settings: { hubId: "acme", agentId: "triage", params: { temperature: 0 } },
      messages: question,
      tools: [readFile.chatTool],
    });

    for (const request of model.requests) {
      expect(request).toMatchObject({
        hubId: "acme",
        agentId: "triage",
        params: { temperature: 0 },
        tools: [readFile.chatTool.definition],
      });
    }
  });

  it("runs a turn's tool calls in the model's order before the next turn", async () => {
    const order: string[] = [];
    const first = tool("first", () => {
      order.push("first");
      return "1";
    });
    const second = tool("second", () => {
      order.push("second");
      return "2";
    });
    const { model, service } = setUp([
      toolTurn(call("c1", "second"), call("c2", "first")),
      textTurn("Both done."),
    ]);

    const answer = await service.answer({
      settings,
      messages: question,
      tools: [first.chatTool, second.chatTool],
    });

    expect(order).toEqual(["second", "first"]);
    expect(answer.messages.filter((message) => message.role === "tool")).toHaveLength(2);
    expect(model.requests).toHaveLength(2);
  });

  it("keeps the provider's replay on the assistant message unchanged", async () => {
    const replay = { type: "anthropic", data: [{ type: "thinking", signature: "sig-1" }] };
    const { service } = setUp([{ ...textTurn("Hello."), replay }]);

    const answer = await service.answer({ settings, messages: question, tools: [] });

    expect(answer.messages).toEqual([{ role: "assistant", content: "Hello.", replay }]);
  });

  it("doesn't change the conversation it was given", async () => {
    const messages = [...question];
    const { service } = setUp([toolTurn(call("c1", "read_file")), textTurn("Done.")]);

    await service.answer({ settings, messages, tools: [tool("read_file").chatTool] });

    expect(messages).toEqual(question);
  });

  it("gives the model a failing tool's error and carries on", async () => {
    const readFile = tool("read_file", () => {
      throw new Error("no such file: notes.md");
    });
    const { service } = setUp([
      toolTurn(call("c1", "read_file")),
      textTurn("That file is missing."),
    ]);

    const answer = await service.answer({
      settings,
      messages: question,
      tools: [readFile.chatTool],
    });

    expect(answer.messages[1]).toEqual({
      role: "tool",
      content: "Error: no such file: notes.md",
      toolCallId: "c1",
      name: "read_file",
    });
    expect(answer.end).toEqual({ reason: "answered" });
  });

  it("tells the model when it calls a tool the chat doesn't offer", async () => {
    const { service } = setUp([toolTurn(call("c1", "send_mail")), textTurn("I can't send mail.")]);

    const answer = await service.answer({ settings, messages: question, tools: [] });

    expect(answer.messages[1]).toMatchObject({
      content: 'Error: there is no tool named "send_mail".',
      toolCallId: "c1",
    });
  });
});

verifies("app.chat-turn-limit", () => {
  it("stops after 16 turns by default, with the last turn's tools run", async () => {
    const readFile = tool("read_file");
    const turns = Array.from({ length: 17 }, (_, index) =>
      toolTurn(call(`c${index + 1}`, "read_file")),
    );
    const { model, service } = setUp(turns);

    const answer = await service.answer({
      settings,
      messages: question,
      tools: [readFile.chatTool],
    });

    expect(answer.end).toEqual({ reason: "turn-limit", turns: 16 });
    expect(model.requests).toHaveLength(16);
    expect(readFile.calls).toHaveLength(16);
    expect(answer.messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "c16" });
  });

  it("follows a turn limit it is given", async () => {
    const turns = Array.from({ length: 5 }, () => toolTurn(call("c", "read_file")));
    const { model, service } = setUp(turns);

    const answer = await service.answer({
      settings,
      messages: question,
      tools: [tool("read_file").chatTool],
      turnLimit: 4,
    });

    expect(answer.end).toEqual({ reason: "turn-limit", turns: 4 });
    expect(model.requests).toHaveLength(4);
  });

  it("refuses a turn limit outside 1 to 64 before asking the model", async () => {
    const { model, service } = setUp([textTurn("Hello.")]);

    for (const turnLimit of [0, 65, 2.5, Number.NaN]) {
      await expect(
        service.answer({ settings, messages: question, tools: [], turnLimit }),
      ).rejects.toThrow(RangeError);
    }
    expect(model.requests).toEqual([]);
  });

  it("accepts the lowest and highest turn limits", async () => {
    const { service } = setUp([textTurn("One."), textTurn("Two.")]);

    for (const turnLimit of [1, 64]) {
      const answer = await service.answer({ settings, messages: question, tools: [], turnLimit });
      expect(answer.end).toEqual({ reason: "answered" });
    }
  });
});
