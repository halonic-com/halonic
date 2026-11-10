import { type BridgeProviderAccess, harnessBridgeTokenHeader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { controlledStream, fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun, send } from "./fakes.test-helper.ts";
import type { Fetch } from "./pass-through.ts";

/** The value the fake secrets hold for the agent's key. Not a real key. */
const agentKey = "anthropic-test-value";

/** The fake secrets: the agent's key, and one that holds a line break. */
const secretValues = new Map([
  ["anthropic-key", agentKey],
  ["broken-key", "anthropic-test\r\nvalue"],
]);

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const keyed: BridgeProviderAccess = { kind: "key", secret: "anthropic-key" };

/** Opens a bridge that serves only the Anthropic route, for an agent with the given access (`null`: none). */
async function open(fetch: Fetch, anthropic: BridgeProviderAccess | null = keyed) {
  const secrets = { get: async (name: string) => secretValues.get(name) ?? null };
  const route = anthropicRoute({
    secrets,
    fetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  });
  const run = { ...fakeRun(), providers: anthropic === null ? {} : { anthropic } };
  const bridge = await openBridge(run, {
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [route],
  });
  closers.push(bridge.close);
  return bridge;
}

/** Claude Code's request: its own key, its headers, and the run token. */
function programRequest(
  bridge: { url: string; token: string },
  body: unknown,
  signal?: AbortSignal,
) {
  return fetch(`${bridge.url}/v1/messages?beta=true`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "x-api-key": "the-programs-own-placeholder",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14",
      "content-type": "application/json",
      "x-stainless-os": "Linux",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
}

const withPdfAndImage = {
  model: "claude-sonnet-5-5",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0K" } },
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: "JVBE" },
        },
        { type: "text", text: "What's in these?" },
      ],
    },
  ],
};

verifies("harness-bridge.anthropic", () => {
  describe("passing a request on", () => {
    it("sends it to api.anthropic.com with the agent's key, the allowed headers and the same bytes", async () => {
      const anthropic = fakeProvider(
        () =>
          new Response('{"type":"message"}', {
            headers: {
              "content-type": "application/json",
              "request-id": "req_1",
              "x-internal": "no",
            },
          }),
      );
      const bridge = await open(anthropic.fetch);
      const sent = `${JSON.stringify(withPdfAndImage)}\n`;
      const reply = await programRequest(bridge, sent);

      expect(reply.status).toBe(200);
      expect(await reply.text()).toBe('{"type":"message"}');
      expect(reply.headers.get("request-id")).toBe("req_1");
      expect(reply.headers.get("x-internal")).toBeNull();
      const [call] = anthropic.calls;
      expect(call?.url).toBe("https://api.anthropic.com/v1/messages?beta=true");
      expect(call?.body).toBe(sent);
      expect(Object.fromEntries(call?.headers ?? [])).toEqual({
        accept: "*/*",
        "anthropic-beta": "files-api-2025-04-14",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": agentKey,
      });
    });

    it("streams server-sent events back as they arrive", async () => {
      const stream = controlledStream();
      const anthropic = fakeProvider(
        () => new Response(stream.body, { headers: { "content-type": "text/event-stream" } }),
      );
      const bridge = await open(anthropic.fetch);
      const reply = await programRequest(bridge, { ...withPdfAndImage, stream: true });
      const reader = reply.body?.pipeThrough(new TextDecoderStream()).getReader();

      stream.push("event: message_start\ndata: {}\n\n");
      expect((await reader?.read())?.value).toBe("event: message_start\ndata: {}\n\n");
      stream.push("event: message_stop\ndata: {}\n\n");
      expect((await reader?.read())?.value).toBe("event: message_stop\ndata: {}\n\n");
      expect(reply.headers.get("content-type")).toBe("text/event-stream");
    });

    it("gives back Anthropic's own error replies unchanged", async () => {
      const error = '{"type":"error","error":{"type":"rate_limit_error","message":"Slow down."}}';
      const anthropic = fakeProvider(
        () => new Response(error, { status: 429, headers: { "retry-after": "7" } }),
      );
      const reply = await programRequest(await open(anthropic.fetch), withPdfAndImage);
      expect(reply.status).toBe(429);
      expect(reply.headers.get("retry-after")).toBe("7");
      expect(await reply.text()).toBe(error);
    });
  });

  it("removes Anthropic's web tools by their type, and keeps every other tool", async () => {
    const anthropic = fakeProvider(() => new Response("{}"));
    const tools = [
      { type: "web_search_20250305", name: "web_search" },
      { type: "web_fetch_20250910", name: "renamed_fetch" },
      { name: "web_search", description: "The program's own tool", input_schema: {} },
      { type: "text_editor_20250728", name: "str_replace_based_edit_tool" },
    ];
    await programRequest(await open(anthropic.fetch), { ...withPdfAndImage, tools });

    const forwarded = JSON.parse(anthropic.calls[0]?.body ?? "");
    expect(forwarded.tools).toEqual([tools[2], tools[3]]);
    expect(forwarded.messages).toEqual(withPdfAndImage.messages);
  });

  it("removes the MCP connector's servers, and keeps the rest of the request", async () => {
    const anthropic = fakeProvider(() => new Response("{}"));
    const mcp_servers = [{ type: "url", url: "https://mcp.example.test/sse", name: "outside" }];
    await programRequest(await open(anthropic.fetch), { ...withPdfAndImage, mcp_servers });

    expect(JSON.parse(anthropic.calls[0]?.body ?? "")).toEqual(withPdfAndImage);
  });

  describe("refusing", () => {
    const cases: [string, BridgeProviderAccess | null, string, number][] = [
      ["an agent that doesn't use Anthropic", null, "denied", 403],
      ["an agent that signs in with a subscription", { kind: "sign-in" }, "denied", 403],
      ["a key that isn't set", { kind: "key", secret: "missing" }, "unauthenticated", 401],
    ];
    for (const [who, access, kind, status] of cases) {
      it(`refuses ${who} without calling Anthropic`, async () => {
        const anthropic = fakeProvider(() => new Response("{}"));
        const reply = await programRequest(await open(anthropic.fetch, access), withPdfAndImage);
        expect(reply.status).toBe(status);
        expect(await reply.json()).toMatchObject({ error: { type: kind } });
        expect(anthropic.calls).toHaveLength(0);
      });
    }

    it("refuses a key that holds a line break, and names only its secret", async () => {
      const anthropic = fakeProvider(() => new Response("{}"));
      const broken: BridgeProviderAccess = { kind: "key", secret: "broken-key" };
      const reply = await programRequest(await open(anthropic.fetch, broken), withPdfAndImage);
      expect(reply.status).toBe(401);
      const text = await reply.text();
      expect(JSON.parse(text).error.message).toContain('The secret "broken-key"');
      expect(text).not.toContain("anthropic-test");
      expect(anthropic.calls).toHaveLength(0);
    });

    const urlSources: [string, unknown[], string][] = [
      [
        "an image",
        [{ type: "image", source: { type: "url", url: "https://example.test/a.png" } }],
        "The image block at messages[0].content[0]",
      ],
      [
        "a PDF in a tool result",
        [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: [
              { type: "text", text: "Here it is." },
              { type: "document", source: { type: "url", url: "https://example.test/a.pdf" } },
            ],
          },
        ],
        "The document block at messages[0].content[0].content[1]",
      ],
    ];
    for (const [what, content, named] of urlSources) {
      it(`refuses ${what} that Anthropic would fetch from a URL, naming the block`, async () => {
        const anthropic = fakeProvider(() => new Response("{}"));
        const request = { ...withPdfAndImage, messages: [{ role: "user", content }] };
        const reply = await programRequest(await open(anthropic.fetch), request);
        expect(reply.status).toBe(403);
        expect(await reply.json()).toMatchObject({
          error: { type: "denied", message: expect.stringContaining(named) },
        });
        expect(anthropic.calls).toHaveLength(0);
      });
    }

    it("refuses a body that isn't JSON", async () => {
      const anthropic = fakeProvider(() => new Response("{}"));
      const reply = await programRequest(await open(anthropic.fetch), "{not json");
      expect(reply.status).toBe(400);
      expect(anthropic.calls).toHaveLength(0);
    });

    it("answers 404 for any other Anthropic path", async () => {
      const anthropic = fakeProvider(() => new Response("{}"));
      const bridge = await open(anthropic.fetch);
      const reply = await send(bridge, "/v1/complete", { token: bridge.token, body: "{}" });
      expect(reply.status).toBe(404);
      expect(anthropic.calls).toHaveLength(0);
    });

    it("answers 503 when Anthropic can't be reached", async () => {
      const anthropic = fakeProvider(() => Promise.reject(new TypeError("fetch failed")));
      const reply = await programRequest(await open(anthropic.fetch), withPdfAndImage);
      expect(reply.status).toBe(503);
      expect(await reply.json()).toMatchObject({
        error: { type: "unavailable", message: "Halonic couldn't reach Anthropic." },
      });
    });
  });
});
