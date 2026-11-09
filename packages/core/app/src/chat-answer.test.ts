import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { notRunAfterStop } from "./chat-answer.ts";
import {
  type ChatAnswerListener,
  ChatService,
  type ChatSettings,
  type ChatTool,
} from "./chat-service.ts";
import { call, ScriptedChat, textTurn, tool, toolTurn } from "./testing/scripted-chat.ts";

const settings: ChatSettings = { hubId: "acme", alias: "default" };
const question: ChatMessage[] = [{ role: "user", content: "Tidy the triage workflow." }];

verifies("app.chat-stop", () => {
  it("starts no further turn after Stop and drops the answer that comes after it", async () => {
    const stop = new AbortController();
    const model = new ScriptedChat([
      toolTurn(call("c1", "read_file")),
      toolTurn(call("c2", "read_file")),
      () => {
        stop.abort();
        return toolTurn(call("c3", "read_file"));
      },
      textTurn("never asked"),
    ]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [tool("read_file").chatTool],
      signal: stop.signal,
    });

    expect(answer.end).toEqual({ reason: "stopped", toolsRan: true });
    expect(model.requests).toHaveLength(3);
    expect(answer.messages.map((message) => message.role)).toEqual([
      "assistant",
      "tool",
      "assistant",
      "tool",
    ]);
  });

  it("runs no further tool call after Stop and gives the rest a result", async () => {
    const stop = new AbortController();
    const first = tool("first", () => {
      stop.abort();
      return "first done";
    });
    const second = tool("second");
    const model = new ScriptedChat([toolTurn(call("c1", "first"), call("c2", "second"))]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [first.chatTool, second.chatTool],
      signal: stop.signal,
    });

    expect(answer.end).toEqual({ reason: "stopped", toolsRan: true });
    expect(second.calls).toEqual([]);
    expect(answer.messages.slice(1)).toEqual([
      { role: "tool", content: "first done", toolCallId: "c1", name: "first" },
      { role: "tool", content: notRunAfterStop, toolCallId: "c2", name: "second" },
    ]);
  });

  it("ends as stopped, not with the turn limit, when Stop comes during the last turn", async () => {
    const stop = new AbortController();
    const first = tool("first", () => {
      stop.abort();
      return "first done";
    });
    const second = tool("second");
    const model = new ScriptedChat([toolTurn(call("c1", "first"), call("c2", "second"))]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [first.chatTool, second.chatTool],
      turnLimit: 1,
      signal: stop.signal,
    });

    expect(answer.end).toEqual({ reason: "stopped", toolsRan: true });
    expect(second.calls).toEqual([]);
    expect(answer.messages.at(-1)).toMatchObject({ content: notRunAfterStop, toolCallId: "c2" });
  });

  it("doesn't ask the model when stopped before the answer began", async () => {
    const model = new ScriptedChat([textTurn("never asked")]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [],
      signal: AbortSignal.abort(),
    });

    expect(answer).toEqual({ messages: [], end: { reason: "stopped", toolsRan: false } });
    expect(model.requests).toEqual([]);
  });

  it("ends as stopped, not failed, when the model call fails after Stop", async () => {
    const stop = new AbortController();
    const model = new ScriptedChat([
      () => {
        stop.abort();
        return new Error("connection closed");
      },
    ]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [],
      signal: stop.signal,
    });

    expect(answer.end).toEqual({ reason: "stopped", toolsRan: false });
  });

  it("passes the stop signal on to every model turn and tool call", async () => {
    const stop = new AbortController();
    const toolSignals: (AbortSignal | undefined)[] = [];
    const readFile: ChatTool = {
      ...tool("read_file").chatTool,
      async call(_toolCall, signal) {
        toolSignals.push(signal);
        return "ok";
      },
    };
    const model = new ScriptedChat([toolTurn(call("c1", "read_file")), textTurn("Done.")]);

    await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [readFile],
      signal: stop.signal,
    });

    expect(model.requests.map((request) => request.signal)).toEqual([stop.signal, stop.signal]);
    expect(toolSignals).toEqual([stop.signal]);
  });

  it("leaves the signal out of the model turn when the answer has none", async () => {
    const model = new ScriptedChat([textTurn("Done.")]);

    await new ChatService(model).answer({ settings, messages: question, tools: [] });

    expect(model.requests[0]).not.toHaveProperty("signal");
  });

  it("drops an answer that comes after Stop from an executor that ignores the signal", async () => {
    const stop = new AbortController();
    const readFile = tool("read_file");
    const model = new ScriptedChat([
      () => {
        stop.abort();
        return toolTurn(call("c1", "read_file"));
      },
    ]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [readFile.chatTool],
      signal: stop.signal,
    });

    expect(answer).toEqual({ messages: [], end: { reason: "stopped", toolsRan: false } });
    expect(readFile.calls).toEqual([]);
  });
});

verifies("app.chat-failure", () => {
  it("ends as failed with no tool run when the first turn fails", async () => {
    const error = new Error("Anthropic didn't answer.");
    const model = new ScriptedChat([error]);

    const answer = await new ChatService(model).answer({ settings, messages: question, tools: [] });

    expect(answer).toEqual({ messages: [], end: { reason: "failed", error, toolsRan: false } });
  });

  it("keeps what was added and says a tool ran when a later turn fails", async () => {
    const error = new Error("Anthropic didn't answer.");
    const model = new ScriptedChat([toolTurn(call("c1", "read_file")), error]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [tool("read_file").chatTool],
    });

    expect(answer.end).toEqual({ reason: "failed", error, toolsRan: true });
    expect(answer.messages).toHaveLength(2);
  });

  it("counts a tool that failed as run, since it may have changed something", async () => {
    const sendMail = tool("send_mail", () => {
      throw new Error("timed out after sending");
    });
    const model = new ScriptedChat([toolTurn(call("c1", "send_mail")), new Error("lost")]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [sendMail.chatTool],
    });

    expect(answer.end).toMatchObject({ reason: "failed", toolsRan: true });
  });

  it("doesn't count a call of a tool the chat doesn't offer", async () => {
    const model = new ScriptedChat([toolTurn(call("c1", "send_mail")), new Error("lost")]);

    const answer = await new ChatService(model).answer({ settings, messages: question, tools: [] });

    expect(answer.end).toMatchObject({ reason: "failed", toolsRan: false });
  });

  it("ends as failed with the listener's error, keeping what was added, when the listener throws", async () => {
    const error = new Error("the transcript is closed");
    const sendMail = tool("send_mail", () => "sent");
    const listener: ChatAnswerListener = {
      onMessage: (message) => {
        if (message.role === "tool") {
          throw error;
        }
      },
    };
    const model = new ScriptedChat([toolTurn(call("c1", "send_mail")), textTurn("never asked")]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [sendMail.chatTool],
      listener,
    });

    expect(answer.end).toEqual({ reason: "failed", error, toolsRan: true });
    expect(sendMail.calls).toHaveLength(1);
    expect(answer.messages.map((message) => message.role)).toEqual(["assistant", "tool"]);
    expect(model.requests).toHaveLength(1);
  });

  it("ends as failed when the listener throws as a turn or tool call starts", async () => {
    const error = new Error("the status line is gone");
    const throwing: ChatAnswerListener[] = [
      {
        onTurn: () => {
          throw error;
        },
      },
      {
        onToolCall: () => {
          throw error;
        },
      },
    ];

    for (const listener of throwing) {
      const readFile = tool("read_file");
      const model = new ScriptedChat([toolTurn(call("c1", "read_file")), textTurn("Done.")]);

      const answer = await new ChatService(model).answer({
        settings,
        messages: question,
        tools: [readFile.chatTool],
        listener,
      });

      expect(answer.end).toEqual({ reason: "failed", error, toolsRan: false });
      expect(readFile.calls).toEqual([]);
    }
  });

  it("turns a rejection that isn't an Error into one", async () => {
    const model = { chatTurn: () => Promise.reject("socket hang up") };

    const answer = await new ChatService(model).answer({ settings, messages: question, tools: [] });

    expect(answer.end).toMatchObject({ reason: "failed", error: new Error("socket hang up") });
  });
});

verifies("app.chat-progress", () => {
  it("tells the listener each turn, tool call and message in order", async () => {
    const heard: string[] = [];
    const listener: ChatAnswerListener = {
      onTurn: (turn) => heard.push(`turn ${turn}`),
      onToolCall: (toolCall: ToolCall) => heard.push(`using ${toolCall.name}`),
      onMessage: (message) => heard.push(`message ${message.role}`),
    };
    const model = new ScriptedChat([toolTurn(call("c1", "read_file")), textTurn("Tidied.")]);

    await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [tool("read_file").chatTool],
      listener,
    });

    expect(heard).toEqual([
      "turn 1",
      "message assistant",
      "using read_file",
      "message tool",
      "turn 2",
      "message assistant",
    ]);
  });
});
