import type { ChatAnswerRequest } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { fakeShell, serviceOn } from "../engine/engine-service.testing.ts";
import { answerChatOn } from "../engine/engine-service.ts";
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
