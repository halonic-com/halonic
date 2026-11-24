import type { ProviderRouting } from "@halonicjs/events";
import {
  type BridgeEvent,
  type BridgeFallbackHop,
  type BridgeProviderAccess,
  harnessBridgeTokenHeader,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { fakeProvider, type UpstreamCall } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import { openAiRoute } from "./openai-route.ts";
import type { Fetch } from "./pass-through.ts";

/** The value the fake secrets hold for the agent's OpenRouter key. Not a real key. */
const agentKey = "fallback-test-value";

/** The alias's own host pin, and its fallbacks' pins. */
const pin: ProviderRouting = { order: ["deepinfra/fp8"], data_collection: "deny" };
const backup: BridgeFallbackHop = {
  alias: "fast-backup",
  routing: { order: ["acme-host/fp8"], data_collection: "deny" },
};
const lastResort: BridgeFallbackHop = {
  alias: "fast-last",
  routing: { order: ["acme-other/fp8"], data_collection: "deny" },
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

/** A keyed access on `route` for `acme/flash` with alias `fast`, its pin and `fallbacks`. */
function keyed(
  route: Route,
  fallbacks: readonly BridgeFallbackHop[],
  baseUrl: string = routes[route].baseUrl,
): BridgeProviderAccess {
  return {
    kind: "key",
    secret: "openrouter-key",
    providerId: "openrouter",
    baseUrl,
    models: ["acme/flash"],
    alias: "fast",
    routing: pin,
    fallbacks,
  };
}

/** Answers each call with the next status of `statuses`, then 200 with a usage. */
function answers(...statuses: number[]) {
  return fakeProvider(() => {
    const status = statuses.shift() ?? 200;
    if (status !== 200)
      return Response.json({ error: { message: "provider's own words" } }, { status });
    return Response.json({
      type: "message",
      content: [],
      usage: { input_tokens: 3, output_tokens: 1 },
    });
  });
}

/**
 * Opens a bridge with both model routes for an agent with `access` on
 * `route`, whose compatible provider is `upstream`, and keeps what it records.
 */
async function open(
  route: Route,
  access: BridgeProviderAccess,
  upstream: { fetch: Fetch },
  record: (event: BridgeEvent) => Promise<void> = async () => {},
) {
  const recorded: BridgeEvent[] = [];
  const dependencies = {
    secrets: { get: async (name: string) => (name === "openrouter-key" ? agentKey : null) },
    fetch: answers().fetch,
    compatibleFetch: upstream.fetch,
    limits: { responseTimeoutMs: 200, idleTimeoutMs: 500 },
  };
  const run = {
    ...fakeRun(),
    providers: { [route]: access },
    recorder: {
      record: async (event: BridgeEvent) => {
        await record(event);
        recorded.push(event);
      },
    },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [anthropicRoute(dependencies), openAiRoute(dependencies)],
  });
  closers.push(bridge.close);
  return { bridge, recorded };
}

/** Sends the program's request on `route` and gives the reply's status and text. */
async function programSends(opened: Awaited<ReturnType<typeof open>>, route: Route) {
  const reply = await fetch(`${opened.bridge.url}${routes[route].path}`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: opened.bridge.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(routes[route].body),
  });
  return { status: reply.status, text: await reply.text() };
}

/** The `provider` each call to the provider was sent with. */
function sentPins(calls: readonly UpstreamCall[]): unknown[] {
  return calls.map((call) => (JSON.parse(call.body) as Record<string, unknown>)["provider"]);
}

/** The recorded events, each as its type and the alias it names, if any. */
function logged(recorded: readonly BridgeEvent[]): string[] {
  return recorded.map((event) => {
    if (event.type === "llm.fallback") return `llm.fallback ${event.from} -> ${event.to}`;
    return "alias" in event && event.alias !== undefined
      ? `${event.type} ${event.alias}`
      : event.type;
  });
}

verifies("harness-bridge.host-fallback", () => {
  describe.each(["anthropic", "openai"] as const)("the %s route", (route) => {
    it("moves a call OpenRouter answers with 503 on to the next pin, with the same request", async () => {
      const upstream = answers(503);
      const opened = await open(route, keyed(route, [backup]), upstream);

      const reply = await programSends(opened, route);

      expect(reply.status).toBe(200);
      expect(sentPins(upstream.calls)).toEqual([pin, backup.routing]);
      const [first, second] = upstream.calls;
      // Byte for byte the same request, but its `provider`.
      expect(second?.body).toBe(
        first?.body.replace(JSON.stringify(pin), JSON.stringify(backup.routing)),
      );
      expect(second?.url).toBe(first?.url);
      expect(second?.headers.get("authorization") ?? second?.headers.get("x-api-key")).toContain(
        agentKey,
      );
      expect(logged(opened.recorded)).toEqual([
        "llm.request fast",
        "llm.fallback fast -> fast-backup",
        "llm.request fast-backup",
        "llm.response",
      ]);
    });
  });

  it.each([429, 500, 502, 504, 529])("moves on after a %s", async (status) => {
    const upstream = answers(status);
    const opened = await open("anthropic", keyed("anthropic", [backup]), upstream);

    expect((await programSends(opened, "anthropic")).status).toBe(200);
    expect(upstream.calls).toHaveLength(2);
  });

  it("names the failure in its own words, never the provider's", async () => {
    const opened = await open("anthropic", keyed("anthropic", [backup]), answers(503));

    await programSends(opened, "anthropic");

    const fallback = opened.recorded.find((event) => event.type === "llm.fallback");
    expect(fallback).toEqual({
      type: "llm.fallback",
      agent: "writer",
      from: "fast",
      to: "fast-backup",
      provider: "openrouter",
      model: "acme/flash",
      alias: "fast-backup",
      error: "unavailable: Anthropic answered 503.",
    });
  });

  it("moves on when the host can't be reached", async () => {
    const upstream = answers();
    let unreachable = true;
    const unreachableOnce: Fetch = async (input, init) => {
      if (!unreachable) return upstream.fetch(input, init);
      unreachable = false;
      throw new TypeError("fetch failed");
    };
    const opened = await open("anthropic", keyed("anthropic", [backup]), {
      fetch: unreachableOnce,
    });

    expect((await programSends(opened, "anthropic")).status).toBe(200);
    expect(sentPins(upstream.calls)).toEqual([backup.routing]);
  });

  it("moves on when no status and headers arrive within the response time limit", async () => {
    const upstream = answers();
    let silent = true;
    const silentOnce: Fetch = async (input, init) => {
      if (!silent) return upstream.fetch(input, init);
      silent = false;
      // Never answers: only the bridge's response time limit ends this call.
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
      );
    };
    const opened = await open("anthropic", keyed("anthropic", [backup]), { fetch: silentOnce });

    expect((await programSends(opened, "anthropic")).status).toBe(200);
    expect(sentPins(upstream.calls)).toEqual([backup.routing]);
    expect(opened.recorded.find((event) => event.type === "llm.fallback")).toMatchObject({
      error: "unavailable: Anthropic didn't answer within 0.2 seconds.",
    });
  });

  it.each([401, 402, 403, 400])("never moves on after a %s", async (status) => {
    const upstream = answers(status);
    const opened = await open("anthropic", keyed("anthropic", [backup]), upstream);

    const reply = await programSends(opened, "anthropic");

    expect(reply.status).toBe(status);
    expect(reply.text).toContain("provider's own words");
    expect(upstream.calls).toHaveLength(1);
    expect(logged(opened.recorded)).toEqual(["llm.request fast"]);
  });

  it("never moves on once the reply has started", async () => {
    const breaksOff = fakeProvider(() => {
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          controller.enqueue(new TextEncoder().encode("event: message_start\n"));
          controller.error(new Error("connection reset"));
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    });
    const opened = await open("anthropic", keyed("anthropic", [backup]), breaksOff);

    await programSends(opened, "anthropic").catch(() => undefined);

    expect(breaksOff.calls).toHaveLength(1);
  });

  it("starts the run's next call on the pin it moved on to", async () => {
    const upstream = answers(503);
    const opened = await open("anthropic", keyed("anthropic", [backup]), upstream);

    await programSends(opened, "anthropic");
    await programSends(opened, "anthropic");

    expect(sentPins(upstream.calls)).toEqual([pin, backup.routing, backup.routing]);
  });

  it("gives the program the last hop's reply unchanged", async () => {
    const upstream = answers(503, 503, 503);
    const opened = await open("anthropic", keyed("anthropic", [backup, lastResort]), upstream);

    const reply = await programSends(opened, "anthropic");

    expect(reply.status).toBe(503);
    expect(reply.text).toContain("provider's own words");
    expect(sentPins(upstream.calls)).toEqual([pin, backup.routing, lastResort.routing]);
  });

  it("drops a hop that keeps the data less safe than the first pin", async () => {
    const collects = { alias: "fast-cheap", routing: { order: ["acme-host/fp8"] } };
    const upstream = answers(503);
    const opened = await open("anthropic", keyed("anthropic", [collects]), upstream);

    expect((await programSends(opened, "anthropic")).status).toBe(503);
    expect(upstream.calls).toHaveLength(1);
  });

  it("uses at most three fallbacks", async () => {
    const upstream = answers(503, 503, 503, 503, 503);
    const four = [backup, backup, backup, lastResort];
    const opened = await open("anthropic", keyed("anthropic", four), upstream);

    await programSends(opened, "anthropic");

    expect(sentPins(upstream.calls)).toEqual([pin, backup.routing, backup.routing, backup.routing]);
  });

  it("never moves on at a host other than openrouter.ai", async () => {
    const upstream = answers(503);
    const elsewhere = keyed("anthropic", [backup], "https://models.acme.example/api");
    const opened = await open("anthropic", elsewhere, upstream);

    expect((await programSends(opened, "anthropic")).status).toBe(503);
    expect(upstream.calls).toHaveLength(1);
  });

  it("sends no second try once the budget is reached", async () => {
    const upstream = answers(503);
    let requests = 0;
    const budget = async (event: BridgeEvent) => {
      if (event.type === "llm.request" && ++requests > 1) {
        throw new KindedError("limit_reached", "The run's budget is reached.");
      }
    };
    const opened = await open("anthropic", keyed("anthropic", [backup]), upstream, budget);

    expect((await programSends(opened, "anthropic")).status).toBe(429);
    expect(upstream.calls).toHaveLength(1);
  });
});
