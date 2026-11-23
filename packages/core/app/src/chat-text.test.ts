import type { ChatMessage, ChatTurnText } from "@halonicjs/ports";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { ChatService, type ChatSettings } from "./chat-service.ts";
import { ScriptedChat, textTurn } from "./testing/scripted-chat.ts";

const settings: ChatSettings = { hubId: "acme", alias: "default" };
const question: ChatMessage[] = [{ role: "user", content: "Tidy the triage workflow." }];

/** A model turn that writes `pieces` through the request's `onText`, then answers with them. */
function writingTurn(chat: () => ScriptedChat, ...pieces: string[]) {
  return () => {
    const onText = chat().requests.at(-1)?.onText;
    for (const text of pieces) {
      onText?.({ kind: "delta", text });
    }
    return textTurn(pieces.join(""));
  };
}

verifies("app.chat-text", () => {
  it("tells the listener the turn's text as it is written, before its message", async () => {
    const heard: string[] = [];
    const model: ScriptedChat = new ScriptedChat([writingTurn(() => model, "Hel", "lo")]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [],
      listener: {
        onTurn: (turn) => heard.push(`turn ${turn}`),
        onText: (text) => heard.push(text.kind === "delta" ? `delta ${text.text}` : "restart"),
        onMessage: (message) => heard.push(`message ${message.content}`),
      },
    });

    expect(answer.end).toEqual({ reason: "answered" });
    expect(heard).toEqual(["turn 1", "delta Hel", "delta lo", "message Hello"]);
  });

  it("passes a restart on as it comes", async () => {
    const heard: ChatTurnText[] = [];
    const model: ScriptedChat = new ScriptedChat([
      () => {
        const onText = model.requests[0]?.onText;
        onText?.({ kind: "delta", text: "Draft" });
        onText?.({ kind: "restart" });
        onText?.({ kind: "delta", text: "Done" });
        return textTurn("Done");
      },
    ]);

    await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [],
      listener: { onText: (text) => heard.push(text) },
    });

    expect(heard).toEqual([
      { kind: "delta", text: "Draft" },
      { kind: "restart" },
      { kind: "delta", text: "Done" },
    ]);
  });

  it("asks for no text when the listener doesn't take it", async () => {
    const model = new ScriptedChat([textTurn("Hello")]);

    await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [],
      listener: { onMessage: () => {} },
    });

    expect(model.requests[0]?.onText).toBeUndefined();
  });

  typeTest("keeps onText out of the answer's settings", () => {
    expectTypeOf<ChatSettings>().not.toHaveProperty("onText");
  });

  it("ends the answer as failed with the listener's error when onText throws", async () => {
    const model: ScriptedChat = new ScriptedChat([writingTurn(() => model, "Hel", "lo")]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [],
      listener: {
        onText: () => {
          throw new Error("the transcript is gone");
        },
      },
    });

    expect(answer.end).toMatchObject({ reason: "failed", toolsRan: false });
    expect(answer.end.reason === "failed" && answer.end.error.message).toBe(
      "the transcript is gone",
    );
    expect(answer.messages).toEqual([]);
  });

  it("ends the answer as failed even when the executor catches the listener's error", async () => {
    const model: ScriptedChat = new ScriptedChat([
      () => {
        try {
          model.requests[0]?.onText?.({ kind: "delta", text: "Hi" });
        } catch {
          // An executor that keeps going after its listener failed.
        }
        return textTurn("Hi");
      },
    ]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [],
      listener: {
        onText: () => {
          throw new Error("the transcript is gone");
        },
      },
    });

    expect(answer.end.reason === "failed" && answer.end.error.message).toBe(
      "the transcript is gone",
    );
    expect(answer.messages).toEqual([]);
  });

  it("passes no text on once the person stopped the answer", async () => {
    const stop = new AbortController();
    const heard: ChatTurnText[] = [];
    const model: ScriptedChat = new ScriptedChat([
      () => {
        const onText = model.requests[0]?.onText;
        onText?.({ kind: "delta", text: "Before" });
        stop.abort();
        onText?.({ kind: "delta", text: "After" });
        return textTurn("BeforeAfter");
      },
    ]);

    const answer = await new ChatService(model).answer({
      settings,
      messages: question,
      tools: [],
      signal: stop.signal,
      listener: { onText: (text) => heard.push(text) },
    });

    expect(answer.end).toEqual({ reason: "stopped", toolsRan: false });
    expect(heard).toEqual([{ kind: "delta", text: "Before" }]);
  });
});
