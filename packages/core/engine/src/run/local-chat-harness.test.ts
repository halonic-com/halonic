import type { ChatTurnRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { finished, harnessPorts, stillOpen } from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { engineStoppedMessage } from "./live-harness-calls.ts";
import { runsOn } from "./local-runs-test-kit.test-helper.ts";

const agents = { writer: writerAgent("claude-code"), clerk: { ...writerAgent(), id: "clerk" } };

const chatWith = (agentId: string): ChatTurnRequest => ({
  hubId: "acme",
  agentId,
  messages: [{ role: "user", content: "Draft a reply to support" }],
  tools: [],
});

verifies("engine.local-chat-harness", () => {
  it("runs a chat with an agent whose file names a harness in that harness, not on a model", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, model, runs } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    const response = await executor.chatTurn(chatWith("writer"));

    expect(response.content).toBe("Dear support");
    expect(model.requests).toEqual([]);
    expect(runs.logs.size).toBe(0);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("runs a chat with an agent in Halonic's own loop on its model", async () => {
    const ports = harnessPorts();
    const { executor, model } = runsOn([textAnswer("Hello")], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    const response = await executor.chatTurn(chatWith("clerk"));

    expect(response.content).toBe("Hello");
    expect(model.requests).toHaveLength(1);
    expect(ports.steps).toEqual([]);
  });

  it("refuses a chat with a harness agent when it has no harnesses, rather than use a model", async () => {
    const { executor, model } = runsOn([textAnswer("Hello")], new KernelRuns(), { agents });

    await expect(executor.chatTurn(chatWith("writer"))).rejects.toThrow(
      "no harnesses to run it in",
    );
    expect(model.requests).toEqual([]);
  });

  it("ends a chat turn's start that takes too long from the executor's timers", async () => {
    const ports = harnessPorts();
    ports.sandbox.openHeld = new Promise(() => {});
    const { executor, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    const answer = executor.chatTurn(chatWith("writer"));
    await executor.onTimer(await scheduler.waitFor("chat_1", "start:sandbox:chat_1"));

    await expect(answer).rejects.toMatchObject({ failure: "sandbox-start-failed" });
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("stops a chat turn's harness call when the executor closes", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const running = Promise.withResolvers<void>();
    ports.harness.whileRunning = () => running.resolve();
    const { executor } = runsOn([], new KernelRuns(), { agents, harnesses: ports.options });

    const answer = executor.chatTurn(chatWith("writer"));
    await running.promise;
    await executor.close();

    await expect(answer).rejects.toThrow(engineStoppedMessage);
    expect(stillOpen(ports.steps)).toBe(0);
  });
});
