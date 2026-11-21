import type { ChatMessage, ChatTurnToolFailure } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { ChatService, type ChatSettings } from "./chat-service.ts";
import type { RunFailure } from "./run-failure-facts.ts";
import { call, ScriptedChat, textTurn, toolTurn } from "./testing/scripted-chat.ts";

const settings: ChatSettings = { hubId: "acme", alias: "local" };
const question: ChatMessage[] = [{ role: "user", content: "Find the leave policy." }];

const timedOut: ChatTurnToolFailure = {
  toolCallId: "c1",
  reason: "tool-timeout",
  tool: "search",
  connector: "handbook-files",
  withinMs: 60_000,
};

async function failuresHeard(...turns: ConstructorParameters<typeof ScriptedChat>[0]) {
  const heard: (readonly ChatTurnToolFailure[])[] = [];
  const answer = await new ChatService(new ScriptedChat(turns)).answer({
    settings,
    messages: question,
    tools: [],
    listener: { onToolFailures: (failures) => heard.push(failures) },
  });
  return { heard, end: answer.end };
}

verifies("app.chat-tool-failure", () => {
  it("tells the listener of a connector's call that ran out of time, and goes on", async () => {
    const { heard, end } = await failuresHeard({
      ...textTurn("The handbook didn't answer."),
      toolFailures: [timedOut],
    });

    expect(heard).toEqual([[timedOut]]);
    expect(end).toEqual({ reason: "answered" });
  });

  it("tells the listener once for each turn that had any, in order", async () => {
    const second: ChatTurnToolFailure = { ...timedOut, toolCallId: "c2", tool: "read_page" };
    const { heard } = await failuresHeard(
      { ...toolTurn(call("t1", "pick")), toolFailures: [timedOut, second] },
      textTurn("Done"),
    );

    expect(heard).toEqual([[timedOut, second]]);
  });

  it("doesn't tell the listener of a turn with no failed calls", async () => {
    const { heard } = await failuresHeard({ ...textTurn("Here it is."), toolFailures: [] });

    expect(heard).toEqual([]);
  });

  it("gives a run's facts for the same failure without its call id", () => {
    const { toolCallId: _call, ...facts } = timedOut;
    const asRun: RunFailure = facts;

    expect(asRun).toEqual({
      reason: "tool-timeout",
      tool: "search",
      connector: "handbook-files",
      withinMs: 60_000,
    });
    expectTypeOf<Omit<ChatTurnToolFailure, "toolCallId">>().toMatchTypeOf<RunFailure>();
  });
});
