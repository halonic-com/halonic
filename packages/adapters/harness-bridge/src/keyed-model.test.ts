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

/** The keyed access of an agent whose alias names `model`, or any model when left out. */
const keyed = (model?: string): BridgeProviderAccess => ({
  kind: "key",
  secret: "agent-key",
  ...(model === undefined ? {} : { model }),
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

/** The program's request for `model` on the route of `provider`, with the run token. */
function programSends(
  bridge: { url: string; token: string },
  provider: "anthropic" | "openai",
  model: string,
) {
  const path = provider === "anthropic" ? "/v1/messages" : "/v1/responses";
  const body =
    provider === "anthropic"
      ? { model, max_tokens: 64, messages: [] }
      : { model, input: [], store: false };
  return fetch(`${bridge.url}${path}`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

verifies("harness-bridge.keyed-model", () => {
  describe.each(["anthropic", "openai"] as const)("the %s route", (provider) => {
    it("passes a call for the access's model on with the key", async () => {
      const { bridge, keysRead, upstream } = await open(provider, keyed("glm-5.3"));

      const reply = await programSends(bridge, provider, "glm-5.3");

      expect(reply.status).toBe(200);
      expect(keysRead).toEqual(["agent-key"]);
      expect(upstream.calls).toHaveLength(1);
    });

    it("refuses any other model before it reads the key, records or calls anything", async () => {
      const { bridge, keysRead, recorded, upstream } = await open(provider, keyed("glm-5.3"));

      const reply = await programSends(bridge, provider, "claude-opus-4-7");

      expect(reply.status).toBe(403);
      const text = await reply.text();
      expect(text).toContain("denied");
      expect(text).toContain("glm-5.3");
      expect(text).toContain("claude-opus-4-7");
      expect(text).not.toContain(agentKey);
      expect(keysRead).toEqual([]);
      expect(recorded.filter((event) => event.type !== "bridge.failed")).toEqual([]);
      expect(upstream.calls).toEqual([]);
    });

    it("lets a keyed access without a model call any model, as before", async () => {
      const { bridge, upstream } = await open(provider, keyed());

      expect((await programSends(bridge, provider, "anything-at-all")).status).toBe(200);
      expect(upstream.calls).toHaveLength(1);
    });
  });
});
