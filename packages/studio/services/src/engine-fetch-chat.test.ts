import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { tauriEngineFetch } from "./engine-fetch.ts";
import { FakeShell } from "./fake-shell.test-helper.ts";

const chatTurn = "http://engine.invalid/api/chat-turn";
const lines = "application/x-ndjson";

/** A shell whose `engine_chat_stream` opens every turn; `channels` holds each one's argument. */
function streamingShell(): { shell: FakeShell; channels: string[] } {
  const channels: string[] = [];
  const shell = new FakeShell()
    .answer("engine_chat_stream", (args) => {
      channels.push(String(args["channel"]));
      return { stream: args["stream"] };
    })
    .answer("engine_stream_end", () => null);
  return { shell, channels };
}

/** Holds each request until the file ends, as `engine-fetch.test.ts` explains. */
const heldRequests: Request[] = [];
function turnRequest(accept: string, signal?: AbortSignal): Request {
  const request = new Request(chatTurn, {
    method: "POST",
    headers: { Accept: accept },
    body: JSON.stringify({ messages: [] }),
    ...(signal === undefined ? {} : { signal }),
  });
  heldRequests.push(request);
  return request;
}

async function opened(channels: string[]): Promise<string> {
  await vi.waitFor(() => expect(channels).toHaveLength(1));
  return channels[0] as string;
}

verifies("services.engine-fetch", () => {
  describe("a chat turn that accepts lines", () => {
    it("yields each line as the shell passes it on, then ends", async () => {
      const { shell, channels } = streamingShell();

      const response = await tauriEngineFetch(shell)(turnRequest(`${lines}; charset=utf-8`));
      const channel = await opened(channels);
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      const next = async () => decoder.decode((await reader.read()).value);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(lines);
      shell.send(channel, { index: 0, message: { type: "line", line: { text: "Hel" } } });
      expect(await next()).toBe('{"text":"Hel"}\n');
      shell.send(channel, { index: 1, message: { type: "line", line: { text: "lo" } } });
      expect(await next()).toBe('{"text":"lo"}\n');
      shell.send(channel, { index: 2, message: { type: "line", line: { response: {} } } });
      expect(await next()).toBe('{"response":{}}\n');
      shell.send(channel, { index: 3, message: { type: "end" } });
      expect(await reader.read()).toEqual({ done: true, value: undefined });

      expect(shell.callsOf("engine_chat_stream")).toEqual([
        {
          route: "POST /api/chat-turn",
          body: { messages: [] },
          stream: expect.any(Number),
          channel,
        },
      ]);
      expect(shell.callsOf("engine_request")).toEqual([]);
      expect(shell.registered(channel)).toBe(false);
    });

    it("ends the body and the shell's stream when the turn is stopped", async () => {
      const { shell, channels } = streamingShell();
      const controller = new AbortController();
      const reason = new Error("Stop");

      const response = await tauriEngineFetch(shell)(turnRequest(lines, controller.signal));
      const channel = await opened(channels);
      shell.send(channel, { index: 0, message: { type: "line", line: { text: "Hel" } } });
      controller.abort(reason);

      await expect(response.text()).rejects.toBe(reason);
      const stream = shell.callsOf("engine_chat_stream")[0]?.["stream"];
      expect(shell.callsOf("engine_stream_end")).toEqual([{ stream }]);
      expect(shell.registered(channel)).toBe(false);
    });

    it("answers with the engine's status and body when it refused the turn or answered it whole", async () => {
      const shell = new FakeShell().answer("engine_chat_stream", () => ({
        answer: { status: 400, body: { error: { code: "bad_request" } } },
      }));

      const response = await tauriEngineFetch(shell)(turnRequest(`text/plain, ${lines}`));

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(await response.json()).toEqual({ error: { code: "bad_request" } });
      expect(shell.callsOf("engine_stream_end")).toEqual([]);
    });

    it("hangs up on a run event, which a chat turn never sends", async () => {
      const { shell, channels } = streamingShell();

      const response = await tauriEngineFetch(shell)(turnRequest(lines));
      shell.send(await opened(channels), {
        index: 0,
        message: { type: "event", event: "run", data: "{}" },
      });

      await expect(response.text()).rejects.toMatchObject({ kind: "answer_invalid" });
      expect(shell.callsOf("engine_stream_end")).toHaveLength(1);
    });
  });

  describe("a chat turn that doesn't accept lines", () => {
    it("goes through engine_request as one JSON answer", async () => {
      const shell = new FakeShell().answer("engine_request", () => ({ status: 200, body: {} }));
      const fetch = tauriEngineFetch(shell);

      await fetch(turnRequest("application/json"));
      await fetch(new Request(chatTurn, { method: "POST", body: "{}" }));

      expect(shell.callsOf("engine_request")).toHaveLength(2);
      expect(shell.callsOf("engine_chat_stream")).toEqual([]);
    });
  });
});
