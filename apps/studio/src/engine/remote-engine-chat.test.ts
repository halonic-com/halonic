import { isModelCallError } from "@halonicjs/ports";
import { tauriEngineFetch } from "@halonicjs/studio-services";
import { isUntrustedRefusal } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { setup } from "../agents/workspace-agents.test-helper.ts";
import { answerChatOn, chatExecutorOf } from "./answer-chat-on.ts";
import { RemoteEngine } from "./remote-engine.ts";

type EngineAnswer = { readonly status: number; readonly body: unknown };

/**
 * A background engine whose `POST /api/chat-turn` answers `answer`, reached through the shell's
 * `engine_request`; `turns` holds each turn's body. With no answer, the shell finds no engine.
 */
function backgroundEngine(answer?: EngineAnswer) {
  const turns: unknown[] = [];
  const ipc = {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      if (command !== "engine_request" || args?.["route"] !== "POST /api/chat-turn") {
        throw `${command} isn't a chat turn`;
      }
      turns.push(args["body"]);
      if (answer === undefined) throw { kind: "engine_unavailable", message: "no engine" };
      return answer;
    },
    transformCallback: () => 1,
    unregisterCallback: () => {},
  };
  const engine = new RemoteEngine({ fetch: tauriEngineFetch(ipc), reportError: vi.fn() });
  const { host } = setup({ answerChat: answerChatOn(chatExecutorOf(engine)) });
  return { host, turns };
}

const writer = { hubId: "acme", id: "writer" };
const messages = [{ role: "user", content: "Sort this mail" }] as const;

const answered = {
  model: "claude-haiku",
  content: "Sorted.",
  toolCalls: [],
  usage: { inputTokens: 1, outputTokens: 1 },
  finishReason: "stop",
};

verifies("studio.workspace-agents-chat", () => {
  describe("a Try it chat on the background engine", () => {
    it("sends each turn to the engine's chat-turn route and answers with its reply", async () => {
      const { host, turns } = backgroundEngine({ status: 200, body: answered });
      const answer = await host.answer(writer, { messages });
      expect(answer.end).toEqual({ reason: "answered" });
      expect(answer.messages).toMatchObject([{ role: "assistant", content: "Sorted." }]);
      expect(turns).toMatchObject([{ hubId: "acme", agentId: "writer", messages, tools: [] }]);
    });

    it("ends with the model call's `no-key` reason, so Try it offers Open Models", async () => {
      const { host } = backgroundEngine({
        status: 502,
        body: {
          code: "model_call_failed",
          message: "The model call failed.",
          reason: "no-key",
        },
      });
      const answer = await host.answer(writer, { messages });
      expect(answer.end.reason).toBe("failed");
      const error = answer.end.reason === "failed" ? answer.end.error : undefined;
      expect(isModelCallError(error) && error.reason).toBe("no-key");
    });

    it("rejects as an untrusted workspace, as the page's engine does, so Try it offers Review", async () => {
      const { host } = backgroundEngine({
        status: 403,
        body: { code: "workspace_not_trusted", message: "This workspace isn't trusted." },
      });
      const refusal = await host.answer(writer, { messages }).catch((error: unknown) => error);
      expect(isUntrustedRefusal(refusal)).toBe(true);
    });

    it("rejects with `unavailable` when the shell no longer finds the engine", async () => {
      const { host } = backgroundEngine();
      await expect(host.answer(writer, { messages })).rejects.toMatchObject({
        kind: "unavailable",
        message: "The engine isn't answering.",
      });
    });
  });
});
