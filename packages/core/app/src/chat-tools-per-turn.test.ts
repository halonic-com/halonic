import type { ChatMessage } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ChatService, type ChatSettings, type ChatTool } from "./chat-service.ts";
import { call, ScriptedChat, textTurn, tool, toolTurn } from "./testing/scripted-chat.ts";

const settings: ChatSettings = { hubId: "acme", alias: "local" };
const question: ChatMessage[] = [{ role: "user", content: "Read the notes, then send them." }];

/** Leaves `send` out once a `read` result is in the conversation. */
function noSendAfterRead(tools: readonly ChatTool[], messages: readonly ChatMessage[]) {
  const read = messages.some((message) => message.role === "tool" && message.name === "read");
  return read ? tools.filter((each) => each.definition.name !== "send") : tools;
}

verifies("app.chat-tools-per-turn", () => {
  it("picks the tools again before each turn, and doesn't run a tool the turn left out", async () => {
    const read = tool("read", () => "the notes");
    const send = tool("send");
    const chat = new ScriptedChat([
      toolTurn(call("t1", "read")),
      toolTurn(call("t2", "send")),
      textTurn("Done"),
    ]);

    const answer = await new ChatService(chat).answer({
      settings,
      messages: question,
      tools: [read.chatTool, send.chatTool],
      offerTools: noSendAfterRead,
    });

    const offered = chat.requests.map((request) => request.tools.map((each) => each.name));
    expect(offered).toEqual([["read", "send"], ["read"], ["read"]]);
    expect(send.calls).toEqual([]);
    expect(answer.messages[3]).toMatchObject({ role: "tool", toolCallId: "t2" });
    expect(answer.messages[3]?.content).toBe('Error: there is no tool named "send".');
  });

  it("never offers a tool that isn't one of the answer's tools", async () => {
    const read = tool("read");
    const extra = tool("extra");
    const chat = new ScriptedChat([toolTurn(call("t1", "extra")), textTurn("Done")]);

    await new ChatService(chat).answer({
      settings,
      messages: question,
      tools: [read.chatTool],
      offerTools: (tools) => [...tools, extra.chatTool],
    });

    expect(chat.requests[0]?.tools.map((each) => each.name)).toEqual(["read"]);
    expect(extra.calls).toEqual([]);
  });

  it("offers every tool on every turn without offerTools", async () => {
    const read = tool("read");
    const send = tool("send");
    const chat = new ScriptedChat([toolTurn(call("t1", "read")), textTurn("Done")]);

    await new ChatService(chat).answer({
      settings,
      messages: question,
      tools: [read.chatTool, send.chatTool],
    });

    const offered = chat.requests.map((request) => request.tools.map((each) => each.name));
    expect(offered).toEqual([
      ["read", "send"],
      ["read", "send"],
    ]);
  });
});
