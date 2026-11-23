import {
  type ChatTurnRequest,
  type ChatTurnResponse,
  type Coordination,
  ModelCallError,
  type RunExecutor,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import type { Server, TrustDecision } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const answer = {
  content: "Hello there",
  toolCalls: [],
  usage: { inputTokens: 1, outputTokens: 2 },
  finishReason: "stop",
  model: "test-model",
} as unknown as ChatTurnResponse;
const valid = { hubId: "acme", messages: [{ role: "user", content: "Hi" }], tools: [] };
const ndjson = "application/x-ndjson";

function setup(
  chatTurn: (request: ChatTurnRequest) => Promise<ChatTurnResponse>,
  state: TrustDecision["state"] = "trusted",
) {
  const turns: ChatTurnRequest[] = [];
  const logged: unknown[] = [];
  const runs = {
    chatTurn: (request: ChatTurnRequest) => {
      turns.push(request);
      return chatTurn(request);
    },
  } as unknown as RunExecutor;
  const clock = new TestClock();
  const server = testServer({
    passwordHash: null,
    clock,
    runs,
    trust: { check: async () => ({ state, message: "As set." }) },
    errorLog: { record: (error) => logged.push(error) },
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: { allowedHosts: ["halonic.acme.example"], maxBodyBytes: 4096 },
  });
  return { server, turns, logged };
}

function post(server: Server, accept?: string, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { host: "localhost", "content-type": "application/json" };
  if (accept !== undefined) headers["accept"] = accept;
  return server.handle(
    new Request("https://localhost/api/chat-turn", {
      method: "POST",
      headers,
      body: JSON.stringify(valid),
      ...(signal === undefined ? {} : { signal }),
    }),
  );
}

/** Every line of a streamed answer, parsed. */
async function linesOf(response: Response): Promise<unknown[]> {
  const text = await response.text();
  expect(text.endsWith("\n")).toBe(true);
  return text
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("streamed chat turn route", () => {
  verifies("server.chat-turn-stream", () => {
    it("answers a line per piece of text and restart, then the response", async () => {
      const { server, turns } = setup(async (request) => {
        request.onText?.({ kind: "delta", text: "Hel" });
        request.onText?.({ kind: "restart" });
        request.onText?.({ kind: "delta", text: "Hello " });
        request.onText?.({ kind: "delta", text: "there" });
        return answer;
      });
      const response = await post(server, `text/plain, ${ndjson}; charset=utf-8`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(ndjson);
      expect(await linesOf(response)).toEqual([
        { text: "Hel" },
        { restart: true },
        { text: "Hello " },
        { text: "there" },
        { response: JSON.parse(JSON.stringify(answer)) },
      ]);
      expect(turns[0]).toMatchObject(valid);
      expect(turns[0]?.signal).toBeInstanceOf(AbortSignal);
    });

    it("answers as before, with no onText for the executor, without the header", async () => {
      const { server, turns } = setup(async () => answer);
      const response = await post(server, "application/json");
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toMatchObject({ content: "Hello there" });
      expect(turns[0]?.onText).toBeUndefined();
    });

    it("sends a failure after the 200 as the last line: the reason, never the message", async () => {
      const cause = new ModelCallError("offline", "llm.internal didn't answer.", {
        host: "llm.internal:443",
      });
      const { server, logged } = setup(async (request) => {
        request.onText?.({ kind: "delta", text: "Half an" });
        throw cause;
      });
      const response = await post(server, ndjson);
      expect(response.status).toBe(200);
      const lines = await linesOf(response);
      expect(lines).toEqual([
        { text: "Half an" },
        { error: { code: "model_call_failed", message: expect.any(String), reason: "offline" } },
      ]);
      expect(JSON.stringify(lines)).not.toContain("llm.internal");
      expect(logged).toEqual([cause]);
    });

    it("refuses with a status, before any line, what it refuses without the header", async () => {
      const { server, turns } = setup(async () => answer, "changed");
      const response = await post(server, ndjson);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "workspace_not_trusted" });
      expect(turns).toEqual([]);
    });

    it("aborts the model call when the caller closes the request, logs nothing and sends no last line", async () => {
      const connection = new AbortController();
      const { server, turns, logged } = setup(
        (request) =>
          new Promise((_resolve, reject) => {
            request.onText?.({ kind: "delta", text: "Hel" });
            request.signal?.addEventListener("abort", () => reject(request.signal?.reason));
          }),
      );
      const response = await post(server, ndjson, connection.signal);
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toBe('{"text":"Hel"}\n');
      expect(turns[0]?.signal?.aborted).toBe(false);

      connection.abort(new Error("Stop"));

      await vi.waitFor(() => expect(turns[0]?.signal?.aborted).toBe(true));
      expect((await reader.read()).done).toBe(true);
      expect(logged).toEqual([]);
    });

    it("aborts the model call when the caller stops reading the body", async () => {
      const { server, turns, logged } = setup(
        (request) =>
          new Promise((_resolve, reject) => {
            request.signal?.addEventListener("abort", () => reject(request.signal?.reason));
          }),
      );
      const response = await post(server, ndjson);
      await response.body?.cancel(new Error("Stop"));
      expect(turns[0]?.signal?.aborted).toBe(true);
      await vi.waitFor(() => expect(logged).toEqual([]));
    });
  });
});
