import { type ChatTurnText, ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readChatTurnStream } from "./chat-turn-stream.ts";
import { RemoteHostError, RemoteProtocolError } from "./errors.ts";
import { fakeHost } from "./fake-host.test-helper.ts";
import type { Fetcher } from "./host-client.ts";
import { createRemoteExecutor } from "./remote-executor.ts";

const response = { content: "Hello there", model: "m", toolCalls: [] };
const turn = { hubId: "acme", messages: [], tools: [] };
const ndjson = "application/x-ndjson";

/** A body that sends `chunks`, one per read, then closes, and records whether the reader cancelled it. */
function bodyOf(chunks: readonly string[]) {
  const encoder = new TextEncoder();
  const pending = [...chunks];
  const state = { cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = pending.shift();
      if (chunk === undefined) controller.close();
      else controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { body, state };
}

function streamed(chunks: readonly string[], type = ndjson): Response {
  return new Response(bodyOf(chunks).body, { headers: { "Content-Type": type } });
}

function executorOn(fetcher: Fetcher) {
  return createRemoteExecutor({
    baseUrl: "http://127.0.0.1:4173",
    fetch: fetcher,
    reportError: () => {},
  });
}

const line = (value: unknown) => `${JSON.stringify(value)}\n`;

describe("streamed chat turns", () => {
  verifies("executor-remote.chat-turn-stream", () => {
    it("asks for a stream, passes each text and restart on, and answers the response line", async () => {
      const host = fakeHost(() =>
        streamed([
          line({ text: "Hel" }),
          line({ restart: true }),
          `${line({ text: "Hello " }).slice(0, 5)}`,
          `${line({ text: "Hello " }).slice(5)}${line({ text: "there" })}`,
          line({ response }),
        ]),
      );
      const heard: ChatTurnText[] = [];
      const answer = await executorOn(host.fetch).chatTurn({
        ...turn,
        onText: (t) => heard.push(t),
      });
      expect(answer).toEqual(response);
      expect(heard).toEqual([
        { kind: "delta", text: "Hel" },
        { kind: "restart" },
        { kind: "delta", text: "Hello " },
        { kind: "delta", text: "there" },
      ]);
      expect(host.calls[0]?.headers.get("accept")).toBe(ndjson);
      expect(host.calls[0]?.body).toEqual(turn);
    });

    it("asks for no stream without onText", async () => {
      const host = fakeHost(() => Response.json(response));
      expect(await executorOn(host.fetch).chatTurn(turn)).toEqual(response);
      expect(host.calls[0]?.headers.get("accept")).toBeNull();
    });

    it("reads an older host's whole answer as before, and onText hears nothing", async () => {
      const host = fakeHost(() => Response.json(response));
      const heard: ChatTurnText[] = [];
      const answer = await executorOn(host.fetch).chatTurn({
        ...turn,
        onText: (t) => heard.push(t),
      });
      expect(answer).toEqual(response);
      expect(heard).toEqual([]);
    });

    it("rejects with the error line: a ModelCallError for a known reason, else the host's error", async () => {
      const failed = { code: "model_call_failed", message: "The model didn't answer." };
      const heard: ChatTurnText[] = [];
      const offline = fakeHost(() =>
        streamed([line({ text: "Half an" }), line({ error: { ...failed, reason: "offline" } })]),
      );
      const error = await executorOn(offline.fetch)
        .chatTurn({ ...turn, onText: (t) => heard.push(t) })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ModelCallError);
      expect(error).toMatchObject({ reason: "offline", message: failed.message });
      expect(heard).toEqual([{ kind: "delta", text: "Half an" }]);

      const unknown = fakeHost(() => streamed([line({ error: { ...failed, reason: "odd" } })]));
      const other = await executorOn(unknown.fetch)
        .chatTurn({ ...turn, onText: () => {} })
        .catch((caught: unknown) => caught);
      expect(other).toBeInstanceOf(RemoteHostError);
      expect(other).toMatchObject({ status: 502, code: "model_call_failed" });
    });

    it("fails the turn when the stream ends without a response or error line", async () => {
      const ends = [
        [line({ text: "Hel" })],
        [line({ text: "Hel" }), '{"response":{"content":"Hel'],
        [],
      ];
      for (const chunks of ends) {
        const host = fakeHost(() => streamed(chunks));
        await expect(
          executorOn(host.fetch).chatTurn({ ...turn, onText: () => {} }),
        ).rejects.toBeInstanceOf(RemoteProtocolError);
      }
    });

    it("fails the turn on a line that is not one the host sends, or too long", async () => {
      for (const bad of ["not json\n", "[1]\n", line({ other: 1 }), line({ error: "x" })]) {
        await expect(
          readChatTurnStream(bodyOf([bad]).body, () => {}),
          bad,
        ).rejects.toBeInstanceOf(RemoteProtocolError);
      }
      await expect(
        readChatTurnStream(bodyOf(["x".repeat(17)]).body, () => {}, 16),
      ).rejects.toBeInstanceOf(RemoteProtocolError);
    });

    it("stops reading, which closes the request, when onText throws, and rejects with it", async () => {
      const { body, state } = bodyOf([line({ text: "Hel" }), line({ response })]);
      const thrown = new Error("listener broke");
      await expect(
        readChatTurnStream(body, () => {
          throw thrown;
        }),
      ).rejects.toBe(thrown);
      expect(state.cancelled).toBe(true);
    });

    it("rejects when the turn's signal stops it mid-stream", async () => {
      const stop = new AbortController();
      const host = fakeHost(() => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(line({ text: "Hel" })));
            // As `fetch` does, an aborted request breaks its body.
            stop.signal.addEventListener("abort", () => controller.error(stop.signal.reason));
          },
        });
        return new Response(body, { headers: { "Content-Type": ndjson } });
      });
      const reason = new Error("Stop");
      const answer = executorOn(host.fetch).chatTurn({
        ...turn,
        signal: stop.signal,
        onText: () => stop.abort(reason),
      });
      await expect(answer).rejects.toBe(reason);
    });
  });
});
