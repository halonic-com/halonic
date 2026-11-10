import {
  type BridgeEvent,
  type BridgeProviderAccess,
  harnessBridgeTokenHeader,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openBridge } from "./bridge.ts";
import { controlledStream, fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun, send } from "./fakes.test-helper.ts";
import { openAiRoute } from "./openai-route.ts";
import type { Fetch } from "./pass-through.ts";

/** The value the fake secrets hold for the agent's key. Not a real key. */
const agentKey = "openai-test-value";

/** The fake secrets: the agent's key, and one that holds a line break. */
const secretValues = new Map([
  ["openai-key", agentKey],
  ["broken-key", "openai-test\nvalue"],
]);

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const keyed: BridgeProviderAccess = { kind: "key", secret: "openai-key" };

/**
 * Opens a bridge that serves only the OpenAI route, for an agent with the
 * given access (`null`: none), and keeps what it records. Only `gpt-5.5` has
 * a price: 1.25 and 10 per million tokens.
 */
async function open(fetch: Fetch, openai: BridgeProviderAccess | null = keyed) {
  const recorded: BridgeEvent[] = [];
  const secrets = { get: async (name: string) => secretValues.get(name) ?? null };
  const route = openAiRoute({
    secrets,
    fetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  });
  const run = {
    ...fakeRun(),
    providers: openai === null ? {} : { openai },
    price: (_provider: string, model: string) =>
      model === "gpt-5.5" ? { input: 1.25, output: 10 } : null,
    recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
  };
  const bridge = await openBridge(run, {
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [route],
  });
  closers.push(bridge.close);
  return { bridge, recorded };
}

/** Codex's request: its own key and organization, its headers, and the run token. */
function programRequest(
  bridge: { url: string; token: string },
  body: unknown,
  signal?: AbortSignal,
) {
  return fetch(`${bridge.url}/v1/responses`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      authorization: "Bearer the-programs-own-placeholder",
      "openai-organization": "org-placeholder",
      "openai-beta": "responses=experimental",
      accept: "text/event-stream",
      "content-type": "application/json",
      originator: "codex_cli_rs",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
}

/** A Responses request as Codex sends it, with a shell tool and two input items. */
const codexRequest = {
  model: "gpt-5.5",
  instructions: "You are Codex.",
  input: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }] },
  ],
  tools: [{ type: "function", name: "shell", parameters: { type: "object" } }],
  stream: true,
  store: false,
};

/** One server-sent event as the Responses API writes it. */
function event(type: string, data: object) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

const streamed = { headers: { "content-type": "text/event-stream" } };

verifies("harness-bridge.openai", () => {
  describe("passing a request on", () => {
    it("sends it to api.openai.com with the agent's key, the allowed headers and the same bytes", async () => {
      const openai = fakeProvider(
        () =>
          new Response('{"object":"response"}', {
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_1",
              "x-ratelimit-remaining-requests": "99",
              "openai-organization": "org-upstream",
            },
          }),
      );
      const { bridge } = await open(openai.fetch);
      const sent = `${JSON.stringify(codexRequest)}\n`;
      const reply = await programRequest(bridge, sent);

      expect(reply.status).toBe(200);
      expect(await reply.text()).toBe('{"object":"response"}');
      expect(reply.headers.get("x-request-id")).toBe("req_1");
      expect(reply.headers.get("x-ratelimit-remaining-requests")).toBe("99");
      expect(reply.headers.get("openai-organization")).toBeNull();
      const [call] = openai.calls;
      expect(call?.url).toBe("https://api.openai.com/v1/responses");
      expect(call?.body).toBe(sent);
      expect(Object.fromEntries(call?.headers ?? [])).toEqual({
        accept: "text/event-stream",
        authorization: `Bearer ${agentKey}`,
        "content-type": "application/json",
        "openai-beta": "responses=experimental",
      });
    });

    it("streams server-sent events back as they arrive", async () => {
      const stream = controlledStream();
      const openai = fakeProvider(() => new Response(stream.body, streamed));
      const { bridge } = await open(openai.fetch);
      const reply = await programRequest(bridge, codexRequest);
      const reader = reply.body?.pipeThrough(new TextDecoderStream()).getReader();

      const created = event("response.created", { response: { id: "resp_1" } });
      stream.push(created);
      expect((await reader?.read())?.value).toBe(created);
      const delta = event("response.output_text.delta", { delta: "Hi" });
      stream.push(delta);
      expect((await reader?.read())?.value).toBe(delta);
    });

    it("stops the call to OpenAI when Codex goes away", async () => {
      const stream = controlledStream();
      const openai = fakeProvider(() => new Response(stream.body, streamed));
      const { bridge } = await open(openai.fetch);
      const program = new AbortController();
      const reply = await programRequest(bridge, codexRequest, program.signal);
      stream.push(event("response.created", {}));
      await reply.body?.getReader().read();

      program.abort();
      await vi.waitFor(() => expect(openai.calls[0]?.signal.aborted).toBe(true));
    });

    it("gives back OpenAI's own error replies unchanged", async () => {
      const error = '{"error":{"type":"rate_limit_exceeded","message":"Slow down."}}';
      const openai = fakeProvider(
        () => new Response(error, { status: 429, headers: { "retry-after": "7" } }),
      );
      const reply = await programRequest((await open(openai.fetch)).bridge, codexRequest);
      expect(reply.status).toBe(429);
      expect(reply.headers.get("retry-after")).toBe("7");
      expect(await reply.text()).toBe(error);
    });
  });

  it("removes OpenAI's web search and MCP tools by their type, and keeps every other tool", async () => {
    const openai = fakeProvider(() => new Response("{}"));
    const tools = [
      { type: "web_search" },
      { type: "web_search_preview_2025_03_11", search_context_size: "low" },
      { type: "mcp", server_label: "outside", server_url: "https://mcp.example.test" },
      { type: "function", name: "web_search", parameters: { type: "object" } },
      { type: "custom", name: "apply_patch" },
    ];
    const { bridge } = await open(openai.fetch);
    await programRequest(bridge, { ...codexRequest, tools });

    const forwarded = JSON.parse(openai.calls[0]?.body ?? "");
    expect(forwarded.tools).toEqual([tools[3], tools[4]]);
    expect(forwarded.input).toEqual(codexRequest.input);
  });

  describe("refusing", () => {
    const cases: [string, BridgeProviderAccess | null, string, number][] = [
      ["an agent that doesn't use OpenAI", null, "denied", 403],
      ["an agent that signs in with a subscription", { kind: "sign-in" }, "denied", 403],
      ["a key that isn't set", { kind: "key", secret: "missing" }, "unauthenticated", 401],
    ];
    for (const [who, access, kind, status] of cases) {
      it(`refuses ${who} without calling OpenAI`, async () => {
        const openai = fakeProvider(() => new Response("{}"));
        const { bridge } = await open(openai.fetch, access);
        const reply = await programRequest(bridge, codexRequest);
        expect(reply.status).toBe(status);
        expect(await reply.json()).toMatchObject({ error: { type: kind } });
        expect(openai.calls).toHaveLength(0);
      });
    }

    it("refuses a key that holds a line break, and names only its secret", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch, { kind: "key", secret: "broken-key" });
      const reply = await programRequest(bridge, codexRequest);
      expect(reply.status).toBe(401);
      const text = await reply.text();
      expect(JSON.parse(text).error.message).toContain(`The secret "broken-key"`);
      expect(text).not.toContain("openai-test");
      expect(openai.calls).toHaveLength(0);
    });

    it("refuses a body that isn't JSON", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const reply = await programRequest((await open(openai.fetch)).bridge, "{not json");
      expect(reply.status).toBe(400);
      expect(openai.calls).toHaveLength(0);
    });

    it("answers 404 for any other OpenAI path", async () => {
      const openai = fakeProvider(() => new Response("{}"));
      const { bridge } = await open(openai.fetch);
      const reply = await send(bridge, "/v1/chat/completions", { token: bridge.token, body: "{}" });
      expect(reply.status).toBe(404);
      expect(openai.calls).toHaveLength(0);
    });

    it("answers 503 when OpenAI can't be reached", async () => {
      const openai = fakeProvider(() => Promise.reject(new TypeError("fetch failed")));
      const reply = await programRequest((await open(openai.fetch)).bridge, codexRequest);
      expect(reply.status).toBe(503);
      expect(await reply.json()).toMatchObject({
        error: { type: "unavailable", message: "Halonic couldn't reach OpenAI." },
      });
    });
  });
});

const request: BridgeEvent = {
  type: "llm.request",
  agent: "writer",
  provider: "openai",
  model: "gpt-5.5",
  messages: 2,
};

verifies("harness-bridge.spend", () => {
  it("records an OpenAI stream with the usage from response.completed, its text and cost", async () => {
    const usage = { input_tokens: 100, input_tokens_details: { cached_tokens: 20 } };
    const openai = fakeProvider(
      () =>
        new Response(
          [
            event("response.created", { response: { usage: null } }),
            event("response.output_text.delta", { delta: "Hel" }),
            event("response.output_text.delta", { delta: "lo" }),
            event("response.completed", { response: { usage: { ...usage, output_tokens: 42 } } }),
          ].join(""),
          streamed,
        ),
    );
    const { bridge, recorded } = await open(openai.fetch);
    await (await programRequest(bridge, codexRequest)).text();

    await vi.waitFor(() => expect(recorded).toHaveLength(2));
    expect(recorded[0]).toEqual(request);
    expect(recorded[1]).toEqual({
      type: "llm.response",
      agent: "writer",
      provider: "openai",
      model: "gpt-5.5",
      usage: { inputTokens: 100, outputTokens: 42 },
      latencyMs: expect.any(Number),
      text: "Hello",
      cost: (100 * 1.25 + 42 * 10) / 1_000_000,
    });
  });

  it("counts a plain text input as one message", async () => {
    const openai = fakeProvider(() => Response.json({ usage: { input_tokens: 3 } }));
    const { bridge, recorded } = await open(openai.fetch);
    await (await programRequest(bridge, { model: "gpt-5.5", input: "Hi" })).text();

    await vi.waitFor(() => expect(recorded).toHaveLength(2));
    expect(recorded[0]).toMatchObject({ messages: 1 });
  });

  it("records only the request of a stream cut short, because OpenAI sends usage last", async () => {
    const stream = controlledStream();
    const openai = fakeProvider(() => new Response(stream.body, streamed));
    const { bridge, recorded } = await open(openai.fetch);
    const reply = await programRequest(bridge, codexRequest);
    stream.push(event("response.output_text.delta", { delta: "Hel" }));
    await reply.body?.getReader().read();

    await bridge.close();
    expect(recorded).toEqual([request]);
  });

  it("records only the request of a call OpenAI refused", async () => {
    const openai = fakeProvider(() =>
      Response.json(
        { error: { type: "server_error" }, usage: { input_tokens: 10 } },
        { status: 500 },
      ),
    );
    const { bridge, recorded } = await open(openai.fetch);
    expect((await programRequest(bridge, codexRequest)).status).toBe(500);

    await bridge.close();
    expect(recorded).toEqual([request]);
  });

  it("refuses a request that names no model, without calling OpenAI or recording it", async () => {
    const openai = fakeProvider(() => Response.json({}));
    const { bridge, recorded } = await open(openai.fetch);
    const reply = await programRequest(bridge, { ...codexRequest, model: undefined });

    expect(reply.status).toBe(400);
    expect(await reply.json()).toMatchObject({ error: { type: "invalid_input" } });
    expect(openai.calls).toHaveLength(0);
    expect(recorded).toEqual([]);
  });
});
