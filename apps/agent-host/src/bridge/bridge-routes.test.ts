import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import { type HarnessBridgeServer, harnessBridgeTokenHeader, type Secrets } from "@halonicjs/ports";
import { afterEach, describe, expect, it } from "vitest";
import type { ChannelCallLine } from "../server/call-channel.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { BridgeTable, bridgeRoutes } from "./bridge-routes.ts";
import type { OpenBridgeBody } from "./bridge-schemas.ts";

const token = randomLaunchToken();
const authorization = { authorization: `Bearer ${token}` };

/** What the fake secrets hold for the agent's key. Not a real key. */
const agentKey = "anthropic-test-value";

const openBody: OpenBridgeBody = {
  runId: "run_1",
  agentId: "writer",
  providers: { anthropic: { kind: "key", secret: "anthropic-key" } },
  prices: { anthropic: { "claude-sonnet-5-5": { input: 3, output: 15 } } },
};

/** What the fake provider is asked: the key it got. */
const providerKeys: (string | null)[] = [];

let server: HostServer | undefined;
let bridges: BridgeTable;

/** A promise the test settles by hand. */
function signal(): { promise: Promise<void>; settle: () => void } {
  let settle: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** How the bridge servers the tests make open. */
const opening = {
  refuse: false,
  /** When set, `open` waits for it before it listens: a bridge still opening. */
  hold: undefined as Promise<void> | undefined,
  /** Settles when `open` is called. */
  called: signal(),
};

afterEach(async () => {
  await bridges.closeAll();
  await server?.close();
  server = undefined;
  providerKeys.length = 0;
  opening.refuse = false;
  opening.hold = undefined;
  opening.called = signal();
});

async function started(table = new BridgeTable()): Promise<string> {
  bridges = table;
  const fetch = async (_input: unknown, init?: RequestInit): Promise<Response> => {
    providerKeys.push(new Headers(init?.headers).get("x-api-key"));
    const reply = {
      type: "message",
      model: "claude-sonnet-5-5",
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    };
    return new Response(JSON.stringify(reply), { headers: { "content-type": "application/json" } });
  };
  const serverFor = (secrets: Secrets): HarnessBridgeServer => {
    const real = new NodeHarnessBridgeServer({ secrets, fetch, closeTimeoutMs: 1_000 });
    return {
      open: async (options) => {
        opening.called.settle();
        if (opening.refuse) throw new Error("no free port");
        await opening.hold;
        return real.open(options);
      },
    };
  };
  server = await startHostServer(token, bridgeRoutes(serverFor, bridges));
  return server.url;
}

function post(url: string, path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
}

type Handlers = Record<string, (params: unknown) => unknown>;

/**
 * Studio's side: opens a bridge, reads the stream and answers each call with
 * its method's handler. A call without a handler stays unanswered.
 */
class FakeStudio {
  readonly calls: ChannelCallLine[] = [];
  readonly lines: { type: string; call?: string }[] = [];
  readonly stopped = new AbortController();
  bridge = { bridge: "", url: "", token: "" };
  done: Promise<void> = Promise.resolve();

  static async open(url: string, handlers: Handlers): Promise<FakeStudio> {
    const studio = new FakeStudio();
    const response = await post(url, "/v1/bridge/open", openBody, studio.stopped.signal);
    const lines = readLines(response);
    studio.bridge = (await lines.next()).value as FakeStudio["bridge"];
    studio.done = (async () => {
      for await (const line of lines) {
        studio.lines.push(line as { type: string });
        if ((line as ChannelCallLine).type !== "call") continue;
        const call = line as ChannelCallLine;
        studio.calls.push(call);
        const handler = handlers[call.method];
        if (handler === undefined) continue;
        const answer = {
          bridge: studio.bridge.bridge,
          call: call.call,
          result: handler(call.params),
        };
        await post(url, "/v1/bridge/answer", answer);
      }
    })().catch(() => {});
    return studio;
  }
}

/** The values of an NDJSON answer, one per line, as they arrive. */
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

function mcpRequest(bridge: FakeStudio["bridge"], message: unknown): Promise<Response> {
  return fetch(`${bridge.url}/mcp`, {
    method: "POST",
    headers: { [harnessBridgeTokenHeader]: bridge.token, "content-type": "application/json" },
    body: JSON.stringify(message),
  });
}

const tool = { name: "send_mail", description: "Sends a mail", parameters: { type: "object" } };

describe("bridgeRoutes", () => {
  it("opens a bridge and serves Studio's tools through it", async () => {
    const url = await started();
    const studio = await FakeStudio.open(url, { "tools.list": () => [tool] });
    expect(studio.bridge).toMatchObject({
      type: "opened",
      url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/),
    });

    const reply = await mcpRequest(studio.bridge, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    const body = (await reply.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((listed) => listed.name)).toContain("send_mail");
    expect(studio.calls[0]).toMatchObject({ method: "tools.list" });
  });

  it("asks Studio for the provider key, prices the call and records it there", async () => {
    const url = await started();
    const studio = await FakeStudio.open(url, {
      "secrets.get": () => agentKey,
      "recorder.record": () => null,
    });
    const reply = await fetch(`${studio.bridge.url}/v1/messages`, {
      method: "POST",
      headers: {
        [harnessBridgeTokenHeader]: studio.bridge.token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 10, messages: [] }),
    });
    await reply.text();
    expect(providerKeys).toEqual([agentKey]);
    expect(studio.calls[0]).toMatchObject({
      method: "secrets.get",
      params: { name: "anthropic-key" },
    });
    await post(url, "/v1/bridge/close", { bridge: studio.bridge.bridge });
    const recorded = studio.calls.filter((call) => call.method === "recorder.record");
    expect(recorded.map((call) => call.params)).toContainEqual(
      expect.objectContaining({ type: "llm.response", cost: 3 }),
    );
  });

  it("ends the stream and stops the bridge when Studio closes it", async () => {
    const url = await started();
    const studio = await FakeStudio.open(url, {});
    const closed = await post(url, "/v1/bridge/close", { bridge: studio.bridge.bridge });
    expect(await closed.json()).toEqual({ closed: true });
    await studio.done;
    await expect(mcpRequest(studio.bridge, {})).rejects.toThrow();
    expect((await post(url, "/v1/bridge/close", { bridge: studio.bridge.bridge })).status).toBe(
      404,
    );
  });

  it("closes the bridge when Studio goes away, failing the calls it waited for", async () => {
    const url = await started();
    const studio = await FakeStudio.open(url, {});
    const listing = mcpRequest(studio.bridge, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    await expect.poll(() => studio.calls.length).toBe(1);
    studio.stopped.abort();
    await listing.catch(() => {});
    await expect.poll(() => bridges.get(studio.bridge.bridge)).toBeUndefined();
  });

  it("refuses an answer to a call or bridge it doesn't know", async () => {
    const url = await started();
    const studio = await FakeStudio.open(url, {});
    const unknownCall = await post(url, "/v1/bridge/answer", {
      bridge: studio.bridge.bridge,
      call: "9",
      result: null,
    });
    expect(unknownCall.status).toBe(404);
    const unknownBridge = await post(url, "/v1/bridge/answer", {
      bridge: "nope",
      call: "1",
      error: "no",
    });
    expect(unknownBridge.status).toBe(404);
  });

  it("refuses an open whose providers or prices aren't valid", async () => {
    const url = await started();
    const bad = { ...openBody, providers: { gemini: { kind: "sign-in" } } };
    const answer = await post(url, "/v1/bridge/open", bad);
    expect(answer.status).toBe(400);
    expect(((await answer.json()) as { error: { message: string } }).error.message).toContain(
      "providers",
    );
  });

  it("keeps no more bridges than its limit, counting those still opening", async () => {
    const url = await started(new BridgeTable({ maxBridges: 2 }));
    const release = signal();
    opening.hold = release.promise;
    const stillOpening = post(url, "/v1/bridge/open", openBody);
    await opening.called.promise;
    opening.hold = undefined;
    const open = await FakeStudio.open(url, {});

    const refused = await post(url, "/v1/bridge/open", openBody);
    expect(refused.status).toBe(429);
    const { error } = (await refused.json()) as { error: { kind: string } };
    expect(error.kind).toBe("too_many_bridges");

    release.settle();
    const opened = readLines(await stillOpening);
    expect(await opened.next()).toMatchObject({ value: { type: "opened" } });
    expect((await post(url, "/v1/bridge/open", openBody)).status).toBe(429);
    await post(url, "/v1/bridge/close", { bridge: open.bridge.bridge });
    const again = await FakeStudio.open(url, {});
    expect(again.bridge).toMatchObject({ type: "opened" });
  });

  it("frees the place of a bridge that failed to open", async () => {
    const url = await started(new BridgeTable({ maxBridges: 1 }));
    opening.refuse = true;
    const failed = await FakeStudio.open(url, {});
    expect(failed.bridge).toMatchObject({ type: "failed", message: "no free port" });
    opening.refuse = false;
    const open = await FakeStudio.open(url, {});
    expect(open.bridge).toMatchObject({ type: "opened" });
  });
});
