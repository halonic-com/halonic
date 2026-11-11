import { afterEach, describe, expect, it } from "vitest";
import { FrameKind } from "../stdio/frame-codec.ts";
import { TestRelay } from "../stdio/relay.test-helper.ts";
import { healthRoute } from "./health-route.ts";
import {
  defaultHostServerLimits,
  type FramedHostServer,
  type HostRoute,
  type HostServerLimits,
  serveHostOverFrames,
} from "./host-server.ts";
import { randomLaunchToken } from "./launch-token.ts";
import { startNdjsonStream } from "./ndjson-stream.ts";

const token = randomLaunchToken();
const relayPort = 50_123;
const relayHost = `127.0.0.1:${relayPort}`;
let server: FramedHostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** A route that streams two lines, then ends. */
const twoLines: HostRoute = {
  method: "GET",
  path: "/v1/lines",
  handle: (_request, response) => {
    const stream = startNdjsonStream(response);
    stream.send({ line: 1 });
    stream.send({ line: 2 });
    stream.end();
  },
};

/** A route that echoes the request's body. */
const echo: HostRoute = {
  method: "POST",
  path: "/v1/echo",
  handle: async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    response.end(Buffer.concat(chunks));
  },
};

function served(limits: HostServerLimits = defaultHostServerLimits): TestRelay {
  const relay = new TestRelay();
  const routes = [healthRoute("1.2.3"), twoLines, echo];
  server = serveHostOverFrames(token, routes, relay.streams, relayPort, limits);
  return relay;
}

const authorized = { host: relayHost, authorization: `Bearer ${token}` };

describe("serveHostOverFrames", () => {
  it("answers a request with the token, addressed to the relay", async () => {
    const answer = await served().request("/v1/health", { headers: authorized });
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({ ok: true, version: "1.2.3" });
  });

  it("accepts localhost with the relay's port too", async () => {
    const headers = { ...authorized, host: `localhost:${relayPort}` };
    expect((await served().request("/v1/health", { headers })).status).toBe(200);
  });

  it.each([
    ["another port", { ...authorized, host: "127.0.0.1:50124" }, 421],
    ["a rebound host name", { ...authorized, host: `attacker.example:${relayPort}` }, 421],
    ["a web page's origin", { ...authorized, origin: "https://example.com" }, 403],
    ["no token", { host: relayHost }, 401],
  ])("refuses a request with %s", async (_name, headers, status) => {
    expect((await served().request("/v1/health", { headers })).status).toBe(status);
  });

  it("carries a request body of many frames, and a streamed answer", async () => {
    const relay = served();
    const body = "x".repeat(200_000);
    const echoed = await relay.request("/v1/echo", { method: "POST", headers: authorized, body });
    expect(echoed.body).toBe(body);
    const lines = await relay.request("/v1/lines", { headers: authorized });
    expect(lines.body).toBe('{"line":1}\n{"line":2}\n');
  });

  it("answers 408 and drops a connection that doesn't finish its headers in time", async () => {
    const relay = served({ ...defaultHostServerLimits, headersTimeoutMs: 200, checkEveryMs: 50 });
    relay.sendFrame(1, FrameKind.open);
    relay.sendFrame(1, FrameKind.data, Buffer.from("GET /v1/health HTTP/1.1\r\n"));
    await relay.frameWhere((frame) => frame.kind === FrameKind.reset);
    const answer = relay.received.find((frame) => frame.kind === FrameKind.data);
    expect(answer?.bytes.toString()).toMatch(/^HTTP\/1\.1 408/);
  });

  it("drops every open connection when it closes", async () => {
    const relay = served();
    relay.sendFrame(1, FrameKind.open);
    relay.sendFrame(1, FrameKind.data, Buffer.from("GET /v1/health HTTP/1.1\r\n"));
    await new Promise((resolve) => setImmediate(resolve));
    await server?.close();
    expect(relay.received.map((frame) => [frame.connection, frame.kind])).toEqual([
      [1, FrameKind.reset],
    ]);
  });

  it("takes no more connections than its cap", async () => {
    const relay = served({ ...defaultHostServerLimits, maxConnections: 1 });
    relay.sendFrame(1, FrameKind.open);
    relay.sendFrame(2, FrameKind.open);
    const reset = await relay.frameWhere((frame) => frame.kind === FrameKind.reset);
    expect(reset.connection).toBe(2);
  });

  it("ends when the input ends", async () => {
    const relay = served();
    relay.streams.input.end();
    expect(await server?.ended).toBeUndefined();
  });
});
