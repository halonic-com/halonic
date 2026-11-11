import { connect } from "node:net";
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import {
  type HarnessBridgeOptions,
  type HarnessBridgeServer,
  harnessBridgeTokenHeader,
  type OpenHarnessBridge,
  type Secrets,
} from "@halonicjs/ports";
import { parse } from "@halonicjs/schema-kit";
import { afterEach, describe, expect, it } from "vitest";
import type { ChannelCallLine } from "../server/call-channel.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { maxBodyBytes } from "../server/json-body.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { BridgeTable, bridgeRoutes } from "./bridge-routes.ts";
import { type OpenBridgeBody, openBridgeBody, priceIn } from "./bridge-schemas.ts";

/**
 * Attacks on the bridge routes from another program on the same computer:
 * it can reach the host's loopback port and the bridge's, but has neither
 * the launch's token nor the run's. And attacks from a caller that has a
 * token but uses it where it doesn't belong, sends bodies too large, hangs
 * up halfway, or names paths and bridges that aren't its own.
 */

const token = randomLaunchToken();
const authorization = `Bearer ${token}`;

const openBody: OpenBridgeBody = {
  runId: "run_1",
  agentId: "writer",
  providers: { anthropic: { kind: "key", secret: "anthropic-key" } },
  prices: { anthropic: { "claude-sonnet-5-5": { input: 3, output: 15 } } },
};

let server: HostServer | undefined;
let bridges = new BridgeTable();
const studios: FakeStudio[] = [];

afterEach(async () => {
  for (const studio of studios.splice(0)) studio.stopped.abort();
  await bridges.closeAll();
  await server?.close();
  server = undefined;
});

/** Counts the bridges the host opens and closes, and can hold an open back. */
class CountingBridgeServer implements HarnessBridgeServer {
  opened = 0;
  closed = 0;
  hold: Promise<void> | undefined;
  readonly inner: HarnessBridgeServer;

  constructor(secrets: Secrets) {
    this.inner = new NodeHarnessBridgeServer({ secrets, closeTimeoutMs: 1_000 });
  }

  async open(options: HarnessBridgeOptions): Promise<OpenHarnessBridge> {
    this.opened += 1;
    await this.hold;
    const bridge = await this.inner.open(options);
    return {
      url: bridge.url,
      token: bridge.token,
      close: async () => {
        this.closed += 1;
        await bridge.close();
      },
    };
  }
}

/** Every bridge server the host made, in order, across all opens of one test. */
let made: CountingBridgeServer[] = [];
let holdNext: Promise<void> | undefined;

const opened = (): number => made.reduce((sum, server) => sum + server.opened, 0);
const closed = (): number => made.reduce((sum, server) => sum + server.closed, 0);

async function started(): Promise<{ url: string; port: number }> {
  bridges = new BridgeTable();
  made = [];
  holdNext = undefined;
  const serverFor = (secrets: Secrets): HarnessBridgeServer => {
    const counting = new CountingBridgeServer(secrets);
    counting.hold = holdNext;
    made.push(counting);
    return counting;
  };
  server = await startHostServer(token, bridgeRoutes(serverFor, bridges));
  return { url: server.url, port: Number(new URL(server.url).port) };
}

/**
 * Writes `raw` bytes to the port, as any local program can, and resolves with
 * everything sent back once the connection closes (or after `waitMs`).
 */
function rawExchange(port: number, raw: string | Buffer, waitMs = 2_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect(port, "127.0.0.1", () => socket.write(raw));
    const timer = setTimeout(() => socket.destroy(), waitMs);
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function statusOf(answer: string): number {
  return Number(answer.split(" ")[1]);
}

function rawPost(port: number, path: string, headers: string[], body: string): string {
  return [
    `POST ${path} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    "Content-Type: application/json",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "Connection: close",
    ...headers,
    "",
    body,
  ].join("\r\n");
}

function post(url: string, path: string, body: unknown, init: RequestInit = {}): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

/** What the `opened` line gives Studio. */
interface Opened {
  bridge: string;
  url: string;
  token: string;
}

/** Studio's side of one bridge: reads the stream and keeps every call line, answering none. */
class FakeStudio {
  readonly calls: ChannelCallLine[] = [];
  readonly stopped = new AbortController();
  opened: Opened = { bridge: "", url: "", token: "" };
  done: Promise<void> = Promise.resolve();

  static async open(url: string): Promise<FakeStudio> {
    const studio = new FakeStudio();
    studios.push(studio);
    const response = await post(url, "/v1/bridge/open", openBody, {
      signal: studio.stopped.signal,
    });
    const lines = readLines(response);
    studio.opened = (await lines.next()).value as Opened;
    studio.done = (async () => {
      for await (const line of lines) {
        if ((line as ChannelCallLine).type === "call") studio.calls.push(line as ChannelCallLine);
      }
    })().catch(() => {});
    return studio;
  }
}

async function* readLines(response: Response): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of response.body as ReadableStream<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    let end = buffered.indexOf("\n");
    while (end !== -1) {
      yield JSON.parse(buffered.slice(0, end)) as unknown;
      buffered = buffered.slice(end + 1);
      end = buffered.indexOf("\n");
    }
  }
}

/** Asks the bridge for its tools over MCP, which makes a `tools.list` call to Studio. */
function listTools(bridge: Opened, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${bridge.url}/mcp`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

const tool = { name: "send_mail", description: "Sends a mail", parameters: { type: "object" } };

describe("bridge routes, attacked by a local program without the launch's token", () => {
  it("opens, answers and closes nothing without the token, on every bridge path", async () => {
    const { port } = await started();
    const bodies: Record<string, unknown> = {
      "/v1/bridge/open": openBody,
      "/v1/bridge/answer": { bridge: "x", call: "1", result: null },
      "/v1/bridge/close": { bridge: "x" },
    };
    const tries = [[], ["Authorization: Bearer wrong"], [`Authorization: bearer ${token}`]];
    for (const [path, body] of Object.entries(bodies)) {
      for (const headers of tries) {
        const answer = await rawExchange(port, rawPost(port, path, headers, JSON.stringify(body)));
        expect(statusOf(answer), `${path} ${headers.join()}`).toBe(401);
      }
    }
    expect(opened()).toBe(0);
  });

  it("refuses a web page even with the token: any Origin, or a rebound Host", async () => {
    const { port } = await started();
    const body = JSON.stringify(openBody);
    for (const origin of ["null", "http://127.0.0.1", "https://attacker.example"]) {
      const headers = [`Authorization: ${authorization}`, `Origin: ${origin}`];
      const fromPage = rawPost(port, "/v1/bridge/open", headers, body);
      expect(statusOf(await rawExchange(port, fromPage)), origin).toBe(403);
    }
    const rebound = rawPost(
      port,
      "/v1/bridge/open",
      [`Authorization: ${authorization}`],
      body,
    ).replace(`Host: 127.0.0.1:${port}`, `Host: attacker.example:${port}`);
    expect(statusOf(await rawExchange(port, rebound))).toBe(421);
    expect(opened()).toBe(0);
  });
});

describe("bridge routes, attacked with a token used where it doesn't belong", () => {
  it("won't let a bridge's run token into the host, or the launch token into a bridge", async () => {
    const { url } = await started();
    const studio = await FakeStudio.open(url);
    const runToken = studio.opened.token;
    expect(runToken).not.toBe(token);

    const withRunToken = await fetch(`${url}/v1/bridge/open`, {
      method: "POST",
      headers: { authorization: `Bearer ${runToken}`, [harnessBridgeTokenHeader]: runToken },
      body: JSON.stringify(openBody),
    });
    expect(withRunToken.status).toBe(401);

    const withLaunchToken = await fetch(`${studio.opened.url}/mcp`, {
      method: "POST",
      headers: { [harnessBridgeTokenHeader]: token, authorization },
      body: "{}",
    });
    expect(withLaunchToken.status).toBe(401);
    expect(opened()).toBe(1);
  });

  it("gives each bridge its own id, port and token, and one bridge's token opens no other", async () => {
    const { url } = await started();
    const first = await FakeStudio.open(url);
    const second = await FakeStudio.open(url);
    expect(new Set([first.opened.bridge, second.opened.bridge]).size).toBe(2);
    expect(first.opened.url).not.toBe(second.opened.url);
    expect(first.opened.token).not.toBe(second.opened.token);
    expect(first.opened.bridge).toMatch(/^[0-9a-f-]{36}$/);

    const crossed = await listTools({ ...second.opened, token: first.opened.token });
    expect(crossed.status).toBe(401);
    expect(second.calls).toEqual([]);
  });

  it("won't let one bridge's id answer another bridge's call, though their call ids match", async () => {
    const { url } = await started();
    const first = await FakeStudio.open(url);
    const second = await FakeStudio.open(url);
    const listing = listTools(first.opened);
    await expect.poll(() => first.calls.length).toBe(1);
    const call = first.calls[0]?.call ?? "";

    const crossed = await post(url, "/v1/bridge/answer", {
      bridge: second.opened.bridge,
      call,
      result: [{ ...tool, name: "forged" }],
    });
    expect(crossed.status).toBe(404);

    const right = await post(url, "/v1/bridge/answer", {
      bridge: first.opened.bridge,
      call,
      result: [tool],
    });
    expect(right.status).toBe(200);
    const body = (await (await listing).json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((listed) => listed.name);
    expect(names).toContain("send_mail");
    expect(names).not.toContain("forged");
  });

  it("finds no bridge by a forged id", async () => {
    const { url } = await started();
    await FakeStudio.open(url);
    const forged = [
      "__proto__",
      "constructor",
      "toString",
      "1",
      "00000000-0000-0000-0000-000000000000",
    ];
    for (const bridge of forged) {
      const answer = await post(url, "/v1/bridge/answer", { bridge, call: "1", result: null });
      expect(answer.status, bridge).toBe(404);
      const close = await post(url, "/v1/bridge/close", { bridge });
      expect(close.status, bridge).toBe(404);
    }
    expect(closed()).toBe(0);
  });

  it("forgets a closed bridge: its id, port and token are all dead", async () => {
    const { url } = await started();
    const studio = await FakeStudio.open(url);
    expect((await post(url, "/v1/bridge/close", { bridge: studio.opened.bridge })).status).toBe(
      200,
    );
    await studio.done;

    const late = await post(url, "/v1/bridge/answer", {
      bridge: studio.opened.bridge,
      call: "1",
      result: [tool],
    });
    expect(late.status).toBe(404);
    expect((await post(url, "/v1/bridge/close", { bridge: studio.opened.bridge })).status).toBe(
      404,
    );
    await expect(listTools(studio.opened)).rejects.toThrow();
  });
});

describe("bridge routes, attacked with bodies too large or callers that hang up", () => {
  it("refuses an open body over the limit before it opens anything", async () => {
    const { url, port } = await started();
    const large = { ...openBody, runId: "r".repeat(maxBodyBytes) };
    const answer = await post(url, "/v1/bridge/open", large);
    expect(answer.status).toBe(413);

    // Claims 1 GiB and stops just past the limit: the host answers without waiting for the rest.
    const claimed = [
      "POST /v1/bridge/open HTTP/1.1",
      `Host: 127.0.0.1:${port}`,
      `Authorization: ${authorization}`,
      "Content-Type: application/json",
      `Content-Length: ${1024 ** 3}`,
      "",
      "r".repeat(maxBodyBytes + 1),
    ].join("\r\n");
    const sentAt = Date.now();
    expect(statusOf(await rawExchange(port, claimed, 3_000))).toBe(413);
    expect(Date.now() - sentAt).toBeLessThan(3_000);
    expect(opened()).toBe(0);
  });

  it("refuses an answer over the limit, and the call still takes a later, smaller answer", async () => {
    const { url } = await started();
    const studio = await FakeStudio.open(url);
    const listing = listTools(studio.opened);
    await expect.poll(() => studio.calls.length).toBe(1);
    const call = studio.calls[0]?.call ?? "";

    const huge = [{ ...tool, description: "d".repeat(maxBodyBytes) }];
    const tooLarge = await post(url, "/v1/bridge/answer", {
      bridge: studio.opened.bridge,
      call,
      result: huge,
    });
    expect(tooLarge.status).toBe(413);

    const answered = await post(url, "/v1/bridge/answer", {
      bridge: studio.opened.bridge,
      call,
      error: "the tool list is too large",
    });
    expect(answered.status).toBe(200);
    expect((await listing).ok).toBe(true);
  });

  it("closes a bridge whose caller hung up while it was still opening", async () => {
    const { url } = await started();
    let release: () => void = () => {};
    holdNext = new Promise((resolve) => {
      release = resolve;
    });
    const stop = new AbortController();
    const opening = post(url, "/v1/bridge/open", openBody, { signal: stop.signal }).then(
      async (response) => {
        for await (const _ of response.body as ReadableStream<Uint8Array>) stop.abort();
      },
    );
    await expect.poll(() => opened()).toBe(1);
    stop.abort();
    await opening.catch(() => {});
    release();
    await expect.poll(() => closed()).toBe(1);
  });

  it("closes the bridge once, however many closes race for it", async () => {
    const { url } = await started();
    const studio = await FakeStudio.open(url);
    const closes = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(url, "/v1/bridge/close", { bridge: studio.opened.bridge }),
      ),
    );
    for (const close of closes) expect([200, 404]).toContain(close.status);
    expect(closes.filter((close) => close.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(closed()).toBe(1);
  });
});

describe("bridge routes, attacked through paths and keys that try to escape", () => {
  it("serves only the exact paths: no dot segments, doubled or encoded slashes, case or absolute URLs", async () => {
    const { port } = await started();
    const escapes = [
      "/v1/bridge/x/../open",
      "/v1/sandbox/../bridge/open",
      "/v1/bridge/./open",
      "/v1/bridge//open",
      "//v1/bridge/open",
      "/v1/bridge/open/",
      "/v1/bridge/open%2f",
      "/v1/bridge/%6fpen",
      "/v1%2fbridge%2fopen",
      "/V1/bridge/open",
      "/v1/bridge/open;x",
      "/v1/bridge/open%00",
      `http://127.0.0.1:${port}/v1/bridge/open`,
      "*",
    ];
    for (const path of escapes) {
      const answer = await rawExchange(
        port,
        rawPost(port, path, [`Authorization: ${authorization}`], JSON.stringify(openBody)),
      );
      // 404 for a path the host doesn't serve; 400 when Node refuses the request line itself.
      expect([400, 404], path).toContain(statusOf(answer));
    }
    expect(opened()).toBe(0);
  });

  it("answers only POST on the bridge paths", async () => {
    const { url } = await started();
    for (const method of ["GET", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
      const answer = await fetch(`${url}/v1/bridge/open`, {
        method,
        headers: { authorization },
        ...(method === "GET" || method === "OPTIONS" ? {} : { body: JSON.stringify(openBody) }),
      });
      expect(answer.status, method).toBe(404);
    }
    expect(opened()).toBe(0);
  });

  it("keeps prices to the table's own keys, whatever the keys are named", () => {
    const raw = JSON.parse(
      '{"runId":"r","agentId":"a","providers":{},"prices":{"anthropic":{"__proto__":{"input":1,"output":1},"constructor":{"input":2,"output":2}}}}',
    ) as unknown;
    const parsed = parse(openBridgeBody, raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const prices = parsed.value.prices;
    expect(priceIn(prices, "anthropic", "claude-sonnet-5-5")).toBeNull();
    expect(priceIn(prices, "anthropic", "toString")).toBeNull();
    expect(priceIn(prices, "anthropic", "hasOwnProperty")).toBeNull();
    expect(priceIn(prices, "openai", "constructor")).toBeNull();
    expect(Object.hasOwn(Object.prototype, "input")).toBe(false);
  });

  it("refuses providers or access with extra keys, so nothing unnamed reaches the bridge", async () => {
    const { url } = await started();
    const extras = [
      { ...openBody, extra: true },
      { ...openBody, providers: { anthropic: { kind: "key", secret: "k", url: "http://x" } } },
      { ...openBody, providers: { anthropic: { kind: "sign-in", secret: "k" } } },
      { ...openBody, providers: { anthropic: { kind: "key", secret: "" } } },
      { ...openBody, prices: { anthropic: { m: { input: -1, output: 0 } } } },
    ];
    for (const body of extras) {
      expect((await post(url, "/v1/bridge/open", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(opened()).toBe(0);
  });
});
