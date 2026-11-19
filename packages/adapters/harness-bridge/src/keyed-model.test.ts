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
import type { BridgeRoute } from "./route.ts";

/** The value the fake secrets hold for the agent's key. Not a real key. */
const agentKey = "keyed-model-test-value";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** The keyed access of an agent whose alias resolved to `models`, or with no list when left out. */
const keyed = (models?: readonly string[]): BridgeProviderAccess => ({
  kind: "key",
  secret: "agent-key",
  ...(models === undefined ? {} : { models }),
});

/**
 * Opens a bridge with both model routes for an agent with `access` on
 * `provider`, and keeps the keys it reads, what it records and the calls
 * that reach the provider.
 */
async function open(provider: "anthropic" | "openai", access: BridgeProviderAccess) {
  const keysRead: string[] = [];
  const recorded: BridgeEvent[] = [];
  const upstream = fakeProvider(() => Response.json({ type: "message", content: [] }));
  const secrets = {
    get: async (name: string) => {
      keysRead.push(name);
      return name === "agent-key" ? agentKey : null;
    },
  };
  const dependencies = {
    secrets,
    fetch: upstream.fetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  };
  const routes: BridgeRoute[] = [anthropicRoute(dependencies), openAiRoute(dependencies)];
  const run = {
    ...fakeRun(),
    providers: { [provider]: access },
    recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes,
  });
  closers.push(bridge.close);
  return { bridge, keysRead, recorded, upstream };
}

/** The program's usual request for `model` on the route of `provider`. */
function requestFor(provider: "anthropic" | "openai", model: string): Record<string, unknown> {
  return provider === "anthropic"
    ? { model, max_tokens: 64, messages: [] }
    : { model, input: [], store: false };
}

/** The program's request `body` on the route of `provider`, with the run token. */
function programSends(
  bridge: { url: string; token: string },
  provider: "anthropic" | "openai",
  body: Record<string, unknown>,
) {
  const path = provider === "anthropic" ? "/v1/messages" : "/v1/responses";
  return fetch(`${bridge.url}${path}`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Requests that could reach a model other than `glm-5.3`, each with the model's name or a marker. */
function unlistedRequests(provider: "anthropic" | "openai"): [string, Record<string, unknown>][] {
  const listed = requestFor(provider, "glm-5.3");
  return [
    ["another model", requestFor(provider, "claude-opus-4-7")],
    ["another case", requestFor(provider, "GLM-5.3")],
    ["a trailing space", requestFor(provider, "glm-5.3 ")],
    ["a longer name", requestFor(provider, "glm-5.3-x")],
    ["fallbacks", { ...listed, fallbacks: [{ model: "claude-opus-4-7" }] }],
    ["a tool with a model", { ...listed, tools: [{ type: "custom", model: "claude-opus-4-7" }] }],
    ["an image_generation tool", { ...listed, tools: [{ type: "image_generation" }] }],
  ];
}

verifies("harness-bridge.keyed-model", () => {
  describe.each(["anthropic", "openai"] as const)("the %s route", (provider) => {
    it("passes a call for one of the access's models on with the key", async () => {
      const { bridge, keysRead, upstream } = await open(provider, keyed(["glm-5.3"]));

      const reply = await programSends(bridge, provider, requestFor(provider, "glm-5.3"));

      expect(reply.status).toBe(200);
      expect(keysRead).toEqual(["agent-key"]);
      expect(upstream.calls).toHaveLength(1);
    });

    it.each(unlistedRequests(provider))(
      "refuses %s before it reads the key, records or calls anything",
      async (_case, body) => {
        const { bridge, keysRead, recorded, upstream } = await open(provider, keyed(["glm-5.3"]));

        const reply = await programSends(bridge, provider, body);

        expect(reply.status).toBe(403);
        const told = JSON.stringify([await reply.text(), recorded]);
        expect(told).toContain("denied");
        expect(told).not.toContain("glm-5.3");
        expect(told).not.toContain("claude-opus-4-7");
        expect(told).not.toContain(agentKey);
        expect(keysRead).toEqual([]);
        expect(recorded.filter((event) => event.type !== "bridge.failed")).toEqual([]);
        expect(upstream.calls).toEqual([]);
      },
    );

    it.each([
      ["no model", { ...requestFor(provider, "glm-5.3"), model: undefined }],
      ["a model that isn't a string", { ...requestFor(provider, "glm-5.3"), model: ["glm-5.3"] }],
    ])("refuses a request with %s before it reads the key", async (_case, body) => {
      const { bridge, keysRead, upstream } = await open(provider, keyed(["glm-5.3"]));

      const reply = await programSends(bridge, provider, body);

      expect(reply.status).toBe(400);
      expect(await reply.text()).toContain("invalid_input");
      expect(keysRead).toEqual([]);
      expect(upstream.calls).toEqual([]);
    });

    it("refuses every call when the access's list is empty", async () => {
      const { bridge, keysRead, upstream } = await open(provider, keyed([]));

      const reply = await programSends(bridge, provider, requestFor(provider, "glm-5.3"));

      expect(reply.status).toBe(403);
      expect(keysRead).toEqual([]);
      expect(upstream.calls).toEqual([]);
    });

    it("lets a keyed access without models call any model, as before", async () => {
      const { bridge, upstream } = await open(provider, keyed());

      const reply = await programSends(bridge, provider, requestFor(provider, "anything-at-all"));

      expect(reply.status).toBe(200);
      expect(upstream.calls).toHaveLength(1);
    });
  });
});
