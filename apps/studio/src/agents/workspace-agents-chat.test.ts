import type { ChatAnswerRequest } from "@halonicjs/app";
import { RefusalsFeed } from "@halonicjs/studio-feature-library/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { answerChatOn } from "../engine/answer-chat-on.ts";
import { fakeShell, serviceOn } from "../engine/engine-service.testing.ts";
import { setup, writerFile } from "./workspace-agents.test-helper.ts";

verifies("studio.workspace-agents-chat", () => {
  describe("WorkspaceAgents answer", () => {
    const ref = { hubId: "acme", id: "writer" };
    const messages = [{ role: "user", content: "Sort this mail" }] as const;

    it("answers on the engine by the agent's id, with no tools of its own and its model call limit", async () => {
      const requests: ChatAnswerRequest[] = [];
      const { host } = setup({
        answerChat: async (request) => {
          requests.push(request);
          return { messages: [], end: { reason: "answered" } };
        },
      });
      const stop = new AbortController();
      const answer = await host.answer(ref, { messages, signal: stop.signal });
      expect(answer.end).toEqual({ reason: "answered" });
      expect(requests).toEqual([
        {
          settings: { hubId: "acme", agentId: "writer" },
          messages,
          tools: [],
          turnLimit: 6,
          signal: stop.signal,
        },
      ]);
    });

    it("stops a chat answer at 64 turns when the file allows more", async () => {
      const turnLimits: (number | undefined)[] = [];
      const { host, store } = setup({
        answerChat: async (request) => {
          turnLimits.push(request.turnLimit);
          return { messages: [], end: { reason: "answered" } };
        },
      });
      store["hubs/acme/agents/writer.agent.yaml"] = `${writerFile}maxSteps: 200\n`;
      await host.answer(ref, { messages });
      expect(turnLimits).toEqual([64]);
    });

    it("refuses with `denied` and asks no model once trust is removed while the engine is open", async () => {
      let trusted = true;
      const engine = serviceOn(fakeShell(), undefined, { mayStart: async () => trusted });
      const { executor } = await engine.open();
      const chatTurn = vi.spyOn(executor, "chatTurn").mockRejectedValue(new Error("no model here"));
      const { host } = setup({ answerChat: answerChatOn(engine) });
      await host.answer(ref, { messages });
      expect(chatTurn).toHaveBeenCalledTimes(1);

      trusted = false;

      await expect(host.answer(ref, { messages })).rejects.toMatchObject({
        kind: "denied",
        message: "This workspace isn't trusted yet, so nothing was started.",
      });
      expect(chatTurn).toHaveBeenCalledTimes(1);
      await engine.close();
    });

    it("gives what a turn refused and left waiting to the chat and to the Library's refusals list", async () => {
      const engine = serviceOn(fakeShell());
      const { executor } = await engine.open();
      vi.spyOn(executor, "chatTurn").mockResolvedValue({
        model: "fake",
        content: "Done.",
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: "stop",
        refusals: [{ source: "notes", name: "notes__send", refused: "call", reason: "needs OK" }],
        waiting: [{ source: "notes", name: "lookup" }],
      });
      const feed = new RefusalsFeed();
      const { host } = setup({
        answerChat: answerChatOn(engine, feed),
      });
      const chatHeard: string[] = [];
      await host.answer(ref, {
        messages,
        listener: { onRefusals: (refusals) => chatHeard.push(...refusals.map((r) => r.reason)) },
      });

      expect(chatHeard).toEqual(["needs OK"]);
      expect(feed.refusals("notes").map((row) => row.refusal.reason)).toEqual(["needs OK"]);
      expect(feed.waiting("notes")).toEqual([{ source: "notes", name: "lookup" }]);
      await engine.close();
    });

    it("says the engine isn't answering where there is none, and not_found for an agent that isn't there", async () => {
      const { host } = setup();
      await expect(host.answer(ref, { messages })).rejects.toMatchObject({
        kind: "unavailable",
        message: "The engine isn't answering.",
      });
      await expect(host.answer({ hubId: "acme", id: "gone" }, { messages })).rejects.toMatchObject({
        kind: "not_found",
      });
    });
  });
});
