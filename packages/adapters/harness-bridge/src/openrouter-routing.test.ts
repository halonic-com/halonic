import type { ProviderRouting } from "@halonicjs/events";
import {
  type BridgeEvent,
  type BridgeProviderAccess,
  harnessBridgeTokenHeader,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import { openAiRoute } from "./openai-route.ts";

/** The value the fake secrets hold for the agent's OpenRouter key. Not a real key. */
const agentKey = "routing-test-value";

/** The host pin the alias sets. */
const pin: ProviderRouting = {
  order: ["deepinfra/fp8"],
  allow_fallbacks: false,
  data_collection: "deny",
};

/** Each route, with the `baseUrl` OpenRouter serves its API under and what its program sends. */
const routes = {
  anthropic: {
    baseUrl: "https://openrouter.ai/api",
    path: "/v1/messages",
    body: { model: "acme/flash", max_tokens: 64, messages: [] },
  },
  openai: {
    baseUrl: "https://openrouter.ai/api/v1",
    path: "/v1/responses",
    body: { model: "acme/flash", input: [], store: false },
  },
} as const;

type Route = keyof typeof routes;

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** A keyed access at `baseUrl` for the model `acme/flash`, with `routing`. */
function keyedAt(baseUrl: string, routing: ProviderRouting | undefined): BridgeProviderAccess {
  return {
    kind: "key",
    secret: "openrouter-key",
    providerId: "openrouter",
    baseUrl,
    models: ["acme/flash"],
    ...(routing === undefined ? {} : { routing }),
  };
}

/**
 * Opens a bridge with both model routes for an agent with `access` on
 * `route`'s API, and keeps what it records and the calls that reach the
 * compatible provider.
 */
async function open(route: Route, access: BridgeProviderAccess) {
  const recorded: BridgeEvent[] = [];
  const upstream = fakeProvider(() => Response.json({ type: "message", content: [] }));
  const dependencies = {
    secrets: { get: async (name: string) => (name === "openrouter-key" ? agentKey : null) },
    fetch: fakeProvider(() => Response.json({})).fetch,
    compatibleFetch: upstream.fetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  };
  const run = {
    ...fakeRun(),
    providers: { [route]: access },
    recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [anthropicRoute(dependencies), openAiRoute(dependencies)],
  });
  closers.push(bridge.close);
  return { bridge, recorded, upstream };
}

/** Sends the program's `body` on `route` and gives the reply's status. */
async function programSends(
  opened: Awaited<ReturnType<typeof open>>,
  route: Route,
  body: Record<string, unknown>,
): Promise<number> {
  const reply = await fetch(`${opened.bridge.url}${routes[route].path}`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: opened.bridge.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  await reply.arrayBuffer();
  return reply.status;
}

/** The body the provider got last, parsed. */
function providerGot(opened: Awaited<ReturnType<typeof open>>): Record<string, unknown> {
  return JSON.parse(opened.upstream.calls.at(-1)?.body ?? "null") as Record<string, unknown>;
}

/** The `routing` of each `llm.request` the bridge recorded, `undefined` for one without. */
function recordedRouting(recorded: readonly BridgeEvent[]): unknown[] {
  return recorded
    .filter((event) => event.type === "llm.request")
    .map((event) => ("routing" in event ? event.routing : undefined));
}

verifies("harness-bridge.openrouter-routing", () => {
  describe.each(["anthropic", "openai"] as const)("the %s route", (route) => {
    const { baseUrl, body } = routes[route];

    it("sends the alias's pin as provider, and records it in llm.request", async () => {
      const opened = await open(route, keyedAt(baseUrl, pin));

      expect(await programSends(opened, route, body)).toBe(200);

      expect(providerGot(opened)).toEqual({ ...body, provider: pin });
      expect(recordedRouting(opened.recorded)).toEqual([pin]);
    });

    it("still refuses a provider the program sent, and calls no provider", async () => {
      const opened = await open(route, keyedAt(baseUrl, pin));
      const ownPin = { order: ["acme-host/fp4"], allow_fallbacks: true };

      expect(await programSends(opened, route, { ...body, provider: ownPin })).toBe(403);

      expect(opened.upstream.calls).toEqual([]);
    });

    it("sends no provider when the alias sets no pin", async () => {
      const opened = await open(route, keyedAt(baseUrl, undefined));

      expect(await programSends(opened, route, body)).toBe(200);

      expect(providerGot(opened)).toEqual(body);
      expect(recordedRouting(opened.recorded)).toEqual([undefined]);
    });

    it.each([
      ["another host", "https://models.acme.example/api"],
      ["a subdomain", "https://eu.openrouter.ai/api"],
      ["a look-alike host", "https://openrouter.ai.acme.example/api"],
      ["another port", "https://openrouter.ai:8443/api"],
    ])("sends no pin to %s", async (_case, otherBaseUrl) => {
      const opened = await open(route, keyedAt(otherBaseUrl, pin));

      expect(await programSends(opened, route, body)).toBe(200);

      expect(providerGot(opened)).not.toHaveProperty("provider");
      expect(recordedRouting(opened.recorded)).toEqual([undefined]);
    });

    it("sends only OpenRouter's routing keys of the pin it was given", async () => {
      // A host whose types were bypassed: the bridge still sends only the routing keys.
      const withMore = JSON.parse(JSON.stringify({ ...pin, sort: "price", plugins: [] }));
      const opened = await open(route, keyedAt(baseUrl, withMore as ProviderRouting));

      expect(await programSends(opened, route, body)).toBe(200);

      expect(providerGot(opened)["provider"]).toEqual(pin);
      expect(recordedRouting(opened.recorded)).toEqual([pin]);
    });
  });
});
