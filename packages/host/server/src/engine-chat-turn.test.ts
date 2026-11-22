import { ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { chatTurnPath } from "./chat-turn-routes.ts";
import { passing, sendTo, testEngine } from "./engine-server.test-helper.ts";

/** A Try it turn whose settings name the key a provider file of `acme` keeps. */
const turn = {
  hubId: "acme",
  messages: [{ role: "user", content: "Hello" }],
  tools: [],
  agent: {
    type: "openai-compatible",
    model: "acme-model",
    baseUrl: "https://llm.acme.example/v1",
    secret: "acme-key",
    local: false,
  },
};

/** Sends `body` to the engine's chat-turn route, with the headers given or the passing ones. */
function chat(
  server: ReturnType<typeof testEngine>["server"],
  body: unknown = turn,
  headers: Record<string, string> = passing,
): Promise<Response> {
  return sendTo(server, "POST", chatTurnPath, { body: JSON.stringify(body), headers });
}

verifies("server.engine-server", () => {
  describe("the engine role's chat-turn route, served through createEngineServer", () => {
    it("answers a turn the launch checks, trust and the address check let through", async () => {
      const { server, calls } = testEngine();
      const answer = await chat(server);
      expect(answer.status).toBe(200);
      expect(await answer.json()).toMatchObject({ message: { content: "Hello from acme." } });
      expect(calls.settingsAsked).toEqual([turn.agent]);
      expect(calls.chatTurns).toHaveLength(1);
    });

    it("refuses a turn without the token or with any Origin before the chat handler runs", async () => {
      const { server, calls } = testEngine();
      const noToken = await chat(server, turn, { host: passing.host });
      expect(noToken.status).toBe(401);
      expect(await noToken.json()).toMatchObject({ code: "launch_token_required" });

      const fromPage = await chat(server, turn, { ...passing, origin: "http://127.0.0.1:1420" });
      expect(fromPage.status).toBe(403);
      expect(await fromPage.json()).toMatchObject({ code: "origin_not_allowed" });

      expect(calls.settingsAsked).toEqual([]);
      expect(calls.chatTurns).toEqual([]);
    });

    it("sends no stored key to an address the trusted live version's providers don't name", async () => {
      const { server, calls } = testEngine({ settingsAllowed: false });
      const elsewhere = { ...turn, agent: { ...turn.agent, baseUrl: "https://evil.example/v1" } };
      const answer = await chat(server, elsewhere);
      expect(answer.status).toBe(400);
      expect(await answer.json()).toMatchObject({ code: "model_address_not_allowed" });
      expect(calls.chatTurns).toEqual([]);
    });

    it("refuses an untrusted workspace before the address check is asked", async () => {
      const { server, calls } = testEngine({
        trust: { state: "changed", message: "Review the changes." },
      });
      expect((await chat(server)).status).toBe(403);
      expect(calls.settingsAsked).toEqual([]);
      expect(calls.chatTurns).toEqual([]);
    });

    it("refuses Halonic's and a plugin's secret names before anything else is asked", async () => {
      const { server, calls } = testEngine();
      for (const secret of ["serve-password", "token-key", "plugin__weather__key"]) {
        const answer = await chat(server, { ...turn, agent: { ...turn.agent, secret } });
        expect(answer.status, secret).toBe(400);
        expect(await answer.json(), secret).toMatchObject({ code: "secret_name_not_allowed" });
      }
      expect(calls.settingsAsked).toEqual([]);
      expect(calls.chatTurns).toEqual([]);
    });

    it("keeps a model failure's reason, and its message only in the log", async () => {
      const cause = new ModelCallError("no-key", "No key for llm.acme.example.");
      const { server, calls } = testEngine({ chatTurnFails: cause });
      const answer = await chat(server);
      expect(answer.status).toBe(502);
      const body = await answer.text();
      expect(JSON.parse(body)).toMatchObject({ code: "model_call_failed", reason: "no-key" });
      expect(body).not.toContain("llm.acme.example");
      expect(calls.logged).toEqual([cause]);
    });
  });
});

verifies("server.chat-turn", () => {
  describe("the engine role's chat-turn route, when the shell hangs up", () => {
    it("aborts the model call when the shell hangs up, and logs nothing (HAL-15998)", async () => {
      const { server, calls } = testEngine({ chatTurnWaits: true });
      const connection = new AbortController();
      const answer = sendTo(server, "POST", chatTurnPath, {
        body: JSON.stringify(turn),
        signal: connection.signal,
      });
      await vi.waitFor(() => expect(calls.chatTurns).toHaveLength(1));
      const modelSignal = (calls.chatTurns[0] as { signal?: AbortSignal }).signal;
      expect(modelSignal?.aborted).toBe(false);

      connection.abort(new Error("Stop"));

      expect((await answer).status).toBe(499);
      expect(modelSignal?.aborted).toBe(true);
      expect(calls.logged).toEqual([]);
    });
  });
});
