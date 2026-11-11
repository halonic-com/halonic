import { once } from "node:events";
import { createServer, type RequestListener, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { harnessBridgeTokenHeader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openBridge } from "./bridge.ts";
import { controlledStream, fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import { type Fetch, passThrough, pickHeaders } from "./pass-through.ts";
import type { BridgeRoute } from "./route.ts";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(closers.splice(0).map((close) => close()));
});

/**
 * A route the way a provider's route uses {@link passThrough}: `POST /v1/test`
 * goes on to the fake provider with the `content-type` header and an added
 * `x-key`, and the provider's `content-type` and `retry-after` come back.
 */
function testRoute(fetch: Fetch): BridgeRoute {
  return {
    method: "POST",
    path: "/v1/test",
    handle: async (context) => {
      const headers = pickHeaders(context.request.headers, ["content-type"]);
      await passThrough(
        context,
        {
          provider: "The provider",
          url: new URL("https://provider.test/v1/test"),
          headers: { ...headers, "x-key": "agent-placeholder" },
          body: await context.readBody(),
          replyHeader: (name) => name === "content-type" || name === "retry-after",
        },
        { fetch, limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 } },
      );
    },
  };
}

/** Opens a bridge that serves only the test route. */
function open(fetch: Fetch) {
  return openWith(testRoute(fetch));
}

/** Opens a bridge that serves only `route`. */
async function openWith(route: BridgeRoute) {
  const bridge = await openBridge(fakeRun(), {
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [route],
  });
  closers.push(bridge.close);
  return bridge;
}

/** A local HTTP server that answers with `handle` and counts the requests it gets. */
async function listen(handle: RequestListener) {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    handle(request, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    get requests() {
      return requests;
    },
  };
}

/** A reply body that has a new 64 KiB chunk whenever the bridge asks for one. */
function endlessStream() {
  const chunk = new Uint8Array(64 * 1024);
  return new ReadableStream<Uint8Array>({ pull: (controller) => controller.enqueue(chunk) });
}

/** The program's request, with the run token and a header the provider must not get. */
function programRequest(bridge: { url: string; token: string }, signal?: AbortSignal) {
  return fetch(`${bridge.url}/v1/test`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "content-type": "application/json",
      "x-program-only": "stays",
    },
    body: '{"say":"hi"}\n',
    ...(signal === undefined ? {} : { signal }),
  });
}

verifies("harness-bridge.pass-through", () => {
  describe("passing a request on", () => {
    it("sends the same bytes with only the picked headers, and copies the reply back", async () => {
      const provider = fakeProvider(
        () =>
          new Response('{"ok":true}', {
            status: 201,
            headers: { "content-type": "application/json", "x-internal": "no" },
          }),
      );
      const bridge = await open(provider.fetch);
      const reply = await programRequest(bridge);

      expect(reply.status).toBe(201);
      expect(await reply.text()).toBe('{"ok":true}');
      expect(reply.headers.get("content-type")).toBe("application/json");
      expect(reply.headers.get("x-internal")).toBeNull();
      const [call] = provider.calls;
      expect(call?.url).toBe("https://provider.test/v1/test");
      expect(call?.body).toBe('{"say":"hi"}\n');
      expect(Object.fromEntries(call?.headers ?? [])).toEqual({
        "content-type": "application/json",
        "x-key": "agent-placeholder",
      });
    });

    it("streams the reply back as it arrives", async () => {
      const stream = controlledStream();
      const provider = fakeProvider(
        () => new Response(stream.body, { headers: { "content-type": "text/event-stream" } }),
      );
      const reply = await programRequest(await open(provider.fetch));
      const reader = reply.body?.pipeThrough(new TextDecoderStream()).getReader();

      stream.push("event: start\ndata: {}\n\n");
      expect((await reader?.read())?.value).toBe("event: start\ndata: {}\n\n");
      stream.push("event: stop\ndata: {}\n\n");
      expect((await reader?.read())?.value).toBe("event: stop\ndata: {}\n\n");
    });

    it("gives back the provider's own error replies unchanged", async () => {
      const error = '{"error":{"message":"Slow down."}}';
      const provider = fakeProvider(
        () => new Response(error, { status: 429, headers: { "retry-after": "7" } }),
      );
      const reply = await programRequest(await open(provider.fetch));
      expect(reply.status).toBe(429);
      expect(reply.headers.get("retry-after")).toBe("7");
      expect(await reply.text()).toBe(error);
    });

    it("doesn't follow a redirect, so the key never goes to another address", async () => {
      const elsewhere = await listen((_, response) => response.end("{}"));
      const redirecting = await listen((_, response) => {
        response.writeHead(307, { location: elsewhere.url }).end();
      });
      // Node's own fetch, sent to the redirecting server in place of the provider.
      const toRedirecting: Fetch = (_, init) => fetch(redirecting.url, init);
      const reply = await programRequest(await open(toRedirecting));

      expect(reply.status).toBe(503);
      expect(redirecting.requests).toBe(1);
      expect(elsewhere.requests).toBe(0);
    });

    it("answers 503 when the provider can't be reached", async () => {
      const provider = fakeProvider(() => Promise.reject(new TypeError("fetch failed")));
      const reply = await programRequest(await open(provider.fetch));
      expect(reply.status).toBe(503);
      expect(await reply.json()).toMatchObject({
        error: { type: "unavailable", message: "Halonic couldn't reach The provider." },
      });
    });
  });

  describe("stopping the call to the provider", () => {
    it("stops it when the program goes away", async () => {
      const stream = controlledStream();
      const provider = fakeProvider(() => new Response(stream.body));
      const program = new AbortController();
      const reply = await programRequest(await open(provider.fetch), program.signal);
      stream.push("event: ping\n\n");
      await reply.body?.getReader().read();

      const upstream = provider.calls[0]?.signal;
      const stopped = new Promise((resolve) => upstream?.addEventListener("abort", resolve));
      program.abort();
      await stopped;
      expect(upstream?.aborted).toBe(true);
    });

    it("gives up when the provider doesn't start its reply in time", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const called = Promise.withResolvers<void>();
      const provider = fakeProvider(
        ({ signal }) =>
          new Promise((_, reject) => {
            called.resolve();
            signal.addEventListener("abort", () => reject(signal.reason));
          }),
      );
      const reply = programRequest(await open(provider.fetch));
      await called.promise;
      await vi.advanceTimersByTimeAsync(2_000);

      expect((await reply).status).toBe(503);
      expect(await (await reply).json()).toMatchObject({
        error: { type: "unavailable", message: "The provider didn't answer within 2 seconds." },
      });
    });

    it("cuts a reply that goes silent for longer than the idle limit", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const stream = controlledStream();
      const provider = fakeProvider(() => new Response(stream.body));
      const reply = await programRequest(await open(provider.fetch));
      const reader = reply.body?.getReader();
      stream.push("event: ping\n\n");
      await reader?.read();

      await vi.advanceTimersByTimeAsync(500);
      await expect(reader?.read()).rejects.toThrow();
      expect(provider.calls[0]?.signal.reason).toMatchObject({
        message: "The provider sent nothing for 0.5 seconds.",
      });
    });

    it("cuts a reply the program stops reading, and doesn't blame the provider", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const provider = fakeProvider(() => new Response(endlessStream()));
      const route = testRoute(provider.fetch);
      let response: ServerResponse | undefined;
      const bridge = await openWith({
        ...route,
        handle: (context) => {
          response = context.response;
          return route.handle(context);
        },
      });
      // The program never reads the body, so the bridge soon waits for room to write.
      await programRequest(bridge);
      while (response?.writableNeedDrain !== true) await new Promise(setImmediate);

      await vi.advanceTimersByTimeAsync(500);
      expect(provider.calls[0]?.signal.reason).toMatchObject({
        message: "The program read nothing of the reply for 0.5 seconds.",
      });
    });

    it("stops it when the bridge closes in the middle of a reply", async () => {
      const stream = controlledStream();
      const provider = fakeProvider(() => new Response(stream.body));
      const bridge = await open(provider.fetch);
      const reply = await programRequest(bridge);
      const reader = reply.body?.getReader();
      stream.push("event: ping\n\n");
      await reader?.read();

      await bridge.close();
      expect(provider.calls[0]?.signal.aborted).toBe(true);
      await expect(reader?.read()).rejects.toThrow();
    });
  });

  it("joins a header the program sent more than once", () => {
    expect(pickHeaders({ "x-multi": ["a", "b"], other: "c" }, ["x-multi", "absent"])).toEqual({
      "x-multi": "a, b",
    });
  });
});
