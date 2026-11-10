import type { ChatTurnRequest, HarnessEvent } from "@halonicjs/ports";
import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import { writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { engineStoppedMessage } from "../run/live-harness-calls.ts";
import { ChatHarnessTurns, chatApprovalComment, chatStoppedMessage } from "./chat-harness-turns.ts";
import {
  finished,
  harnessPorts,
  NotingScheduler,
  stillOpen,
} from "./harness-test-kit.test-helper.ts";

const request: ChatTurnRequest = {
  hubId: "acme",
  agentId: "writer",
  messages: [{ role: "user", content: "Draft a reply to support" }],
  tools: [{ name: "pick", description: "Picks", parameters: {} }],
};

/** Chat turns on fake harness ports, with a scheduler that only notes its timers. */
function chatTurnsOn(ports: ReturnType<typeof harnessPorts>) {
  const scheduler = new NotingScheduler();
  const turns = new ChatHarnessTurns({
    harnesses: ports.options,
    scheduler,
    ids: fixedIds(),
    clock: steppingClock(),
  });
  const turn = (chat: ChatTurnRequest = request) =>
    turns.turn({
      request: chat,
      agentId: "writer",
      agent: writerAgent("claude-code"),
      harness: "claude-code",
    });
  return { turns, turn, scheduler };
}

/** A model call as the bridge records it. */
function modelCall(model: string, inputTokens: number, outputTokens: number) {
  return {
    type: "llm.response" as const,
    agent: "writer",
    provider: "anthropic",
    model,
    usage: { inputTokens, outputTokens },
    latencyMs: 10,
    text: "",
  };
}

function askFor(tool: string, callId: string): HarnessEvent {
  return { type: "approval.requested", agent: "writer", tool, args: {}, callId };
}

verifies("engine.chat-harness-turn", () => {
  it("runs the message as one harness call and answers with the agent's result", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    ports.harness.whileRunning = () => {
      const recorder = ports.recorders[0];
      void recorder?.record(modelCall("claude-a", 100, 20));
      void recorder?.record(modelCall("claude-b", 50, 10));
    };
    const { turn } = chatTurnsOn(ports);

    const response = await turn();

    expect(response).toEqual({
      model: "claude-b",
      content: "Dear support",
      toolCalls: [],
      usage: { inputTokens: 150, outputTokens: 30 },
      finishReason: "stop",
      turn: [{ role: "assistant", content: "Dear support" }],
      refusals: [],
    });
    expect(ports.harness.tasks).toEqual([
      expect.objectContaining({
        runId: "chat_1",
        hubId: "acme",
        agentId: "writer",
        prompt: "Draft a reply to support",
      }),
    ]);
    expect(ports.sandbox.profiles).toHaveLength(1);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("starts a new call for each message, with the conversation so far in its prompt", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Sent")];
    const { turn } = chatTurnsOn(ports);

    await turn();
    await turn({
      ...request,
      messages: [
        { role: "system", content: "Be brief" },
        { role: "user", content: "Draft a reply to support" },
        { role: "assistant", content: "Dear support" },
        { role: "user", content: "Send it" },
      ],
    });

    expect(ports.harness.tasks.map((task) => task.runId)).toEqual(["chat_1", "chat_2"]);
    expect(ports.harness.tasks[1]?.prompt).toBe(
      [
        "Here is the conversation so far:",
        "The person: Draft a reply to support",
        "You: Dear support",
        "The person's new message:",
        "Send it",
      ].join("\n\n"),
    );
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("refuses each approval the harness asks for, and reports it as a refused call", async () => {
    const ports = harnessPorts();
    ports.harness.events = [
      askFor("Bash", "toolu_1"),
      askFor("Write", "toolu_2"),
      finished("Couldn't"),
    ];
    const { turn } = chatTurnsOn(ports);

    const response = await turn();

    expect(ports.harness.sent).toEqual([
      { type: "approval", callId: "toolu_1", approved: false, comment: chatApprovalComment },
      { type: "approval", callId: "toolu_2", approved: false, comment: chatApprovalComment },
    ]);
    expect(response.content).toBe("Couldn't");
    expect(response.refusals).toEqual([
      expect.objectContaining({ source: "claude-code", name: "Bash", refused: "call" }),
      expect.objectContaining({ source: "claude-code", name: "Write", refused: "call" }),
    ]);
  });

  it("stops the harness and closes the sandbox when the person stops the chat", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const running = Promise.withResolvers<void>();
    ports.harness.whileRunning = () => running.resolve();
    const { turn } = chatTurnsOn(ports);
    const controller = new AbortController();

    const answer = turn({ ...request, signal: controller.signal });
    await running.promise;
    controller.abort();

    await expect(answer).rejects.toThrow(chatStoppedMessage);
    expect(ports.steps).toEqual([
      "bridge.open",
      "sandbox.open",
      "harness.start",
      "harness.cancel",
      "session.close",
      "bridge.close",
    ]);
  });

  it("starts nothing when the chat was stopped before the turn", async () => {
    const ports = harnessPorts();
    const { turn } = chatTurnsOn(ports);
    const controller = new AbortController();
    controller.abort();

    await expect(turn({ ...request, signal: controller.signal })).rejects.toThrow(
      chatStoppedMessage,
    );
    expect(ports.steps).toEqual([]);
  });

  it("fails the turn when the sandbox doesn't open in time", async () => {
    const ports = harnessPorts();
    ports.sandbox.openHeld = new Promise(() => {});
    const { turn, turns, scheduler } = chatTurnsOn(ports);

    const answer = turn();
    turns.expire(await scheduler.waitFor("chat_1", "start:sandbox:chat_1"));

    await expect(answer).rejects.toMatchObject({ failure: "sandbox-start-failed" });
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("refuses a turn without the person's message last", async () => {
    const ports = harnessPorts();
    const { turn } = chatTurnsOn(ports);

    await expect(
      turn({ ...request, messages: [{ role: "assistant", content: "Hello" }] }),
    ).rejects.toThrow("the person's message last");
    expect(ports.steps).toEqual([]);
  });
});

verifies("engine.chat-harness-turn", () => {
  it("stops a chat turn's harness when the engine stops, and refuses turns after", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const running = Promise.withResolvers<void>();
    ports.harness.whileRunning = () => running.resolve();
    const { turn, turns } = chatTurnsOn(ports);

    const answer = turn();
    await running.promise;
    await turns.close();

    await expect(answer).rejects.toThrow(engineStoppedMessage);
    expect(stillOpen(ports.steps)).toBe(0);
    await expect(turn()).rejects.toThrow(engineStoppedMessage);
  });
});
