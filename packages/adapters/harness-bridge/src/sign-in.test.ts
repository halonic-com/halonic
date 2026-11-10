import {
  type BridgeEvent,
  type BridgeProvider,
  harnessBridgeTokenHeader,
  type OpenHarnessBridge,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import { openAiRoute } from "./openai-route.ts";
import type { Fetch } from "./pass-through.ts";
import type { BridgeRoute } from "./route.ts";

/** The person's sign-in as the program sends it. Made up: not a real token. */
const signIn = "Bearer made-up-subscription-sign-in-0123456789";

/** What each provider's route needs in these tests: its path, fixed host, a request and a reply. */
interface ProviderCase {
  provider: BridgeProvider;
  /** The provider's name as people know it. */
  name: string;
  path: string;
  /** Where the bridge must send the request: the provider's one fixed host. */
  upstream: string;
  route(fetch: Fetch): BridgeRoute;
  /** The program's other headers, which go on as they do for a key. */
  headers: Record<string, string>;
  body: Record<string, unknown>;
  /** A request the bridge refuses itself, before calling the provider. */
  refused: Record<string, unknown>;
  /** A reply that says the call used 10 input and 3 output tokens. */
  reply: string;
}

const limits = { responseTimeoutMs: 2_000, idleTimeoutMs: 500 };

/** A secrets port the bridge must never read for an agent that signs in. */
const noSecrets = {
  get: async (name: string): Promise<string | null> => {
    throw new Error(`The bridge read the secret "${name}" for an agent that signs in.`);
  },
};

const providers: ProviderCase[] = [
  {
    provider: "anthropic",
    name: "Anthropic",
    path: "/v1/messages",
    upstream: "https://api.anthropic.com/v1/messages",
    route: (fetch) => anthropicRoute({ secrets: noSecrets, fetch, limits }),
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
      "content-type": "application/json",
    },
    body: {
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hi" }],
    },
    refused: {
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [{ type: "image", source: { type: "url", url: "https://example.test/a.png" } }],
        },
      ],
    },
    reply: JSON.stringify({
      type: "message",
      content: [{ type: "text", text: "Hello" }],
      usage: { input_tokens: 10, output_tokens: 3 },
    }),
  },
  {
    provider: "openai",
    name: "OpenAI",
    path: "/v1/responses",
    upstream: "https://api.openai.com/v1/responses",
    route: (fetch) => openAiRoute({ secrets: noSecrets, fetch, limits }),
    headers: { "content-type": "application/json" },
    body: { model: "gpt-5.5", input: "Hi" },
    refused: {
      model: "gpt-5.5",
      input: [
        {
          role: "user",
          content: [{ type: "input_file", file_url: "https://example.test/a.pdf" }],
        },
      ],
    },
    reply: JSON.stringify({
      object: "response",
      output: [{ type: "message", content: [{ type: "output_text", text: "Hello" }] }],
      usage: { input_tokens: 10, output_tokens: 3 },
    }),
  },
];

/** A provider's JSON reply with status 200. */
function jsonReply(body: string): Response {
  return new Response(body, { headers: { "content-type": "application/json" } });
}

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(closers.splice(0).map((close) => close()));
});

/**
 * Opens a bridge with the provider's route for an agent that signs in to it,
 * and keeps what it records. Asking for a price fails the test: a sign-in
 * call has no price to look up.
 */
async function open(provider: ProviderCase, fetch: Fetch) {
  const recorded: BridgeEvent[] = [];
  const run = {
    ...fakeRun(),
    providers: { [provider.provider]: { kind: "sign-in" as const } },
    price: () => {
      throw new Error("The bridge asked for a price for a sign-in call.");
    },
    recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
  };
  const bridge = await openBridge(run, {
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [provider.route(fetch)],
  });
  closers.push(bridge.close);
  return { bridge, recorded };
}

/**
 * The program's request: the run token in its own header, `authorization` as
 * given, and headers that must stay behind, such as a key of its own.
 */
function programRequest(
  bridge: OpenHarnessBridge,
  provider: ProviderCase,
  options: { authorization?: string; token?: string; body?: Record<string, unknown> } = {},
) {
  const headers: Record<string, string> = {
    ...provider.headers,
    "x-api-key": "the-programs-own-placeholder",
    "x-stainless-os": "Linux",
    [harnessBridgeTokenHeader]: options.token ?? bridge.token,
  };
  if (options.authorization !== undefined) headers["authorization"] = options.authorization;
  return fetch(`${bridge.url}${provider.path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(options.body ?? provider.body),
  });
}

/** Watches everything the bridge could log while a test runs. */
function watchConsole() {
  const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  return () => spies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" ")));
}

verifies("harness-bridge.sign-in", () => {
  for (const provider of providers) {
    describe(`signing in to ${provider.name}`, () => {
      it(`sends the program's own sign-in to ${provider.upstream} unchanged, and adds nothing`, async () => {
        const upstream = fakeProvider(() => jsonReply(provider.reply));
        const { bridge } = await open(provider, upstream.fetch);
        const reply = await programRequest(bridge, provider, { authorization: signIn });

        expect(reply.status).toBe(200);
        expect(await reply.text()).toBe(provider.reply);
        const [call] = upstream.calls;
        expect(call?.url).toBe(provider.upstream);
        expect(call?.body).toBe(JSON.stringify(provider.body));
        const sent = Object.fromEntries(call?.headers ?? []);
        expect(sent).toEqual({
          accept: "*/*",
          ...provider.headers,
          authorization: signIn,
        });
      });

      it("records the call's tokens at a cost of 0, paid by the subscription, and never the sign-in", async () => {
        const logged = watchConsole();
        const upstream = fakeProvider(() => jsonReply(provider.reply));
        const { bridge, recorded } = await open(provider, upstream.fetch);
        await (await programRequest(bridge, provider, { authorization: signIn })).text();
        await bridge.close();

        expect(recorded.map((event) => event.type)).toEqual(["llm.request", "llm.response"]);
        expect(recorded[1]).toMatchObject({
          usage: { inputTokens: 10, outputTokens: 3 },
          cost: 0,
          paidBy: "subscription",
        });
        expect(JSON.stringify(recorded)).not.toContain("made-up-subscription");
        expect(logged().join("\n")).not.toContain("made-up-subscription");
      });

      it("passes the provider's refusal of the sign-in back unchanged", async () => {
        const refusal = '{"type":"error","error":{"type":"authentication_error"}}';
        const upstream = fakeProvider(
          () =>
            new Response(refusal, {
              status: 401,
              headers: { "content-type": "application/json" },
            }),
        );
        const { bridge } = await open(provider, upstream.fetch);
        const reply = await programRequest(bridge, provider, { authorization: signIn });

        expect(reply.status).toBe(401);
        expect(await reply.text()).toBe(refusal);
      });

      it("keeps the sign-in out of the bridge's own errors", async () => {
        const logged = watchConsole();
        const upstream = fakeProvider(() => jsonReply(provider.reply));
        const { bridge, recorded } = await open(provider, upstream.fetch);
        const reply = await programRequest(bridge, provider, {
          authorization: signIn,
          body: provider.refused,
        });

        expect(reply.status).toBe(403);
        expect(await reply.text()).not.toContain("made-up-subscription");
        expect(JSON.stringify(recorded)).not.toContain("made-up-subscription");
        expect(logged().join("\n")).not.toContain("made-up-subscription");
        expect(upstream.calls).toHaveLength(0);
      });

      it("refuses a request without a sign-in, without calling the provider", async () => {
        const upstream = fakeProvider(() => jsonReply(provider.reply));
        const { bridge } = await open(provider, upstream.fetch);
        const reply = await programRequest(bridge, provider);

        expect(reply.status).toBe(401);
        expect(await reply.json()).toMatchObject({
          error: {
            type: "unauthenticated",
            message: expect.stringContaining("authorization header"),
          },
        });
        expect(upstream.calls).toHaveLength(0);
      });

      it("refuses a sign-in with a character outside ASCII, and doesn't quote it", async () => {
        const upstream = fakeProvider(() => jsonReply(provider.reply));
        const { bridge } = await open(provider, upstream.fetch);
        const reply = await programRequest(bridge, provider, {
          authorization: "Bearer made-up-subscription-é",
        });

        expect(reply.status).toBe(401);
        const text = await reply.text();
        expect(text).toContain("outside ASCII");
        expect(text).not.toContain("made-up-subscription");
        expect(upstream.calls).toHaveLength(0);
      });

      it("never takes the run token from authorization", async () => {
        const upstream = fakeProvider(() => jsonReply(provider.reply));
        const { bridge } = await open(provider, upstream.fetch);
        const reply = await programRequest(bridge, provider, {
          authorization: `Bearer ${bridge.token}`,
          token: "not-the-run-token",
        });

        expect(reply.status).toBe(401);
        expect(await reply.text()).not.toContain(bridge.token);
        expect(upstream.calls).toHaveLength(0);
      });

      it("never sends the run token on", async () => {
        const upstream = fakeProvider(() => jsonReply(provider.reply));
        const { bridge } = await open(provider, upstream.fetch);
        await (await programRequest(bridge, provider, { authorization: signIn })).text();

        const [call] = upstream.calls;
        expect(call?.headers.has(harnessBridgeTokenHeader)).toBe(false);
        expect([...(call?.headers.values() ?? [])].join("\n")).not.toContain(bridge.token);
      });
    });
  }
});
