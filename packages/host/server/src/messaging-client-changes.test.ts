import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ServerAgentMessaging } from "./messaging-client.ts";
import { ServerClientError, type ServerFetch } from "./messaging-client-transport.ts";

/** A server's `changes` stream that the test feeds and ends. */
function changesStream() {
  const encoder = new TextEncoder();
  let feed: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      feed = controller;
    },
  });
  return {
    response: () => new Response(body, { headers: { "content-type": "text/event-stream" } }),
    send(source: string) {
      feed?.enqueue(encoder.encode(`event: change\ndata: ${JSON.stringify({ source })}\n\n`));
    },
    end() {
      feed?.close();
    },
  };
}

/** No server at all: `fetch` fails as it does when nothing answers. */
const down = (): Response => {
  throw new TypeError("fetch failed");
};

/** A `fetch` that answers the n-th request with the n-th of `answers`, and the last after that. */
function scripted(...answers: (() => Response)[]): { fetch: ServerFetch; sent: Request[] } {
  const sent: Request[] = [];
  return {
    sent,
    fetch: async (request) => {
      sent.push(request);
      const next = answers[Math.min(sent.length, answers.length) - 1] ?? down;
      return next();
    },
  };
}

/** More waits than any test here expects, so a reopen that should not happen fails fast. */
const mostWaits = 20;

/** A client whose waits pass at once on a fake clock that records each one. */
function client(fetch: ServerFetch) {
  const waits: number[] = [];
  const messaging = new ServerAgentMessaging({
    address: "https://halonic.acme.example",
    token: "device-token",
    label: "Acme server",
    fetch,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
      if (waits.length > mostWaits)
        throw new Error(`The client waited more than ${mostWaits} times.`);
    },
  });
  return { messaging, waits };
}

verifies("server.messaging-client-changes", () => {
  describe("changes after the server ends its stream", () => {
    it("opens changes again and hears a change sent on the new stream", async () => {
      const first = changesStream();
      const second = changesStream();
      const { fetch, sent } = scripted(first.response, second.response);
      const { messaging, waits } = client(fetch);
      const reader = messaging.changes();

      first.send("src-1");
      const heardFirst = await reader.next();
      first.end();
      const heardSecond = reader.next();
      await expect.poll(() => sent.length).toBe(2);
      second.send("src-2");

      expect(heardFirst).toEqual({ done: false, value: "src-1" });
      expect(await heardSecond).toEqual({ done: false, value: "src-2" });
      expect(waits).toEqual([1000]);
      await reader.return(undefined);
    });

    it("waits longer after each open that fails, up to 60 s", async () => {
      const stream = changesStream();
      stream.send("src-1");
      const { fetch, sent } = scripted(
        down,
        down,
        down,
        down,
        down,
        down,
        down,
        down,
        stream.response,
      );
      const { messaging, waits } = client(fetch);
      const reader = messaging.changes();

      const heard = await reader.next();

      expect(heard).toEqual({ done: false, value: "src-1" });
      expect(sent).toHaveLength(9);
      expect(waits).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000]);
      await reader.return(undefined);
    });

    it("waits 1 s again after a stream that named a change", async () => {
      const brief = changesStream();
      brief.send("src-1");
      brief.end();
      const lasting = changesStream();
      lasting.send("src-2");
      const { fetch } = scripted(down, down, brief.response, down, lasting.response);
      const { messaging, waits } = client(fetch);
      const reader = messaging.changes();

      const heard = [await reader.next(), await reader.next()];

      expect(heard.map((each) => each.value)).toEqual(["src-1", "src-2"]);
      expect(waits).toEqual([1000, 2000, 1000, 2000]);
      await reader.return(undefined);
    });

    it("opens nothing again once the reader stops", async () => {
      const stream = changesStream();
      stream.send("src-1");
      const { fetch, sent } = scripted(stream.response);
      const { messaging, waits } = client(fetch);
      const reader = messaging.changes();

      await reader.next();
      const stopped = await reader.return(undefined);

      expect(stopped).toEqual({ done: true, value: undefined });
      expect(sent).toHaveLength(1);
      expect(waits).toEqual([]);
    });

    it("opens changes again after a 5xx answer, as when the server can't be reached", async () => {
      const stream = changesStream();
      stream.send("src-1");
      const unavailable = () => new Response("Service Unavailable", { status: 503 });
      const { fetch, sent } = scripted(unavailable, unavailable, stream.response);
      const { messaging, waits } = client(fetch);
      const reader = messaging.changes();

      const heard = await reader.next();

      expect(heard).toEqual({ done: false, value: "src-1" });
      expect(sent).toHaveLength(3);
      expect(waits).toEqual([1000, 2000]);
      await reader.return(undefined);
    });

    it("throws bad-answer without opening again after a 400 answer", async () => {
      const { fetch, sent } = scripted(() => new Response("Bad Request", { status: 400 }));
      const { messaging, waits } = client(fetch);

      const failure = await messaging
        .changes()
        [Symbol.asyncIterator]()
        .next()
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServerClientError);
      expect((failure as ServerClientError).reason).toBe("bad-answer");
      expect(sent).toHaveLength(1);
      expect(waits).toEqual([]);
    });

    it("keeps throwing bad-answer when another call gets a 5xx answer", async () => {
      // A write must not read as a refused `offline` ("nothing was sent"): the server may have sent it.
      const { fetch, sent } = scripted(() => new Response("Service Unavailable", { status: 503 }));
      const { messaging, waits } = client(fetch);

      const failure = await messaging.send("conv-1", "Hello").catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServerClientError);
      expect((failure as ServerClientError).reason).toBe("bad-answer");
      expect(sent).toHaveLength(1);
      expect(waits).toEqual([]);
    });

    it("throws without opening again when the server signs the device out", async () => {
      const { fetch, sent } = scripted(() =>
        Response.json({ code: "not_signed_in" }, { status: 401 }),
      );
      const { messaging, waits } = client(fetch);

      const failure = await messaging
        .changes()
        [Symbol.asyncIterator]()
        .next()
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServerClientError);
      expect((failure as ServerClientError).reason).toBe("signed-out");
      expect(sent).toHaveLength(1);
      expect(waits).toEqual([]);
    });
  });
});
