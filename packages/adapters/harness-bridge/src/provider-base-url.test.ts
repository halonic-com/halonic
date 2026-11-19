import {
  type BridgeEvent,
  type BridgeProviderAccess,
  harnessBridgeTokenHeader,
} from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun, send } from "./fakes.test-helper.ts";
import {
  closeOpenedBridges,
  codexRequest,
  programRequest as codexSends,
  agentKey as openAiKey,
  open as openOpenAi,
} from "./openai-route.test-helper.ts";
import type { Fetch } from "./pass-through.ts";
import { requestText, sendPipelined, statuses } from "./raw-client.test-helper.ts";

/** The value the fake secrets hold for the agent's key at a compatible provider. Not a real key. */
const compatibleKey = "compatible-test-value";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await closeOpenedBridges();
});

const answered = () => Response.json({ type: "message", content: [] });

/** The bridge's two ways out: to the APIs' own hosts, and to a compatible provider. */
function twoProviders() {
  return { ownHosts: fakeProvider(answered), compatible: fakeProvider(answered) };
}

/**
 * Opens a bridge that serves only the Anthropic route, for an agent with
 * `access`, and keeps the names of the keys it reads. `compatibleFetch`
 * left out is a server that has none.
 */
async function openAnthropic(access: BridgeProviderAccess, fetch: Fetch, compatibleFetch?: Fetch) {
  const keysRead: string[] = [];
  const secrets = {
    get: async (name: string) => {
      keysRead.push(name);
      return name === "zai-key" ? compatibleKey : null;
    },
  };
  const route = anthropicRoute({
    secrets,
    fetch,
    compatibleFetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  });
  const run = {
    ...fakeRun(),
    providers: { anthropic: access },
    recorder: { record: async () => {} },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [route],
  });
  closers.push(bridge.close);
  return { bridge, keysRead };
}

/** A keyed agent at the compatible provider `baseUrl`. */
const zai = (baseUrl: string): BridgeProviderAccess => ({
  kind: "key",
  secret: "zai-key",
  baseUrl,
  models: ["glm-5.2"],
});

/** Claude Code's request for an open model, with its own key and the run token. */
function claudeCodeSends(bridge: { url: string; token: string }) {
  return fetch(`${bridge.url}/v1/messages?beta=true`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "x-api-key": "the-programs-own-placeholder",
      // A subscription's sign-in, which goes on unchanged; a keyed agent's call drops it.
      authorization: "Bearer the-programs-own-sign-in-placeholder",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "glm-5.2", max_tokens: 64, messages: [] }),
  });
}

verifies("harness-bridge.provider-base-url", () => {
  describe("the Anthropic route", () => {
    it("sends the call and the key to the provider's baseUrl only, through compatibleFetch", async () => {
      const { ownHosts, compatible } = twoProviders();
      const { bridge } = await openAnthropic(
        zai("https://api.z.ai/api/anthropic"),
        ownHosts.fetch,
        compatible.fetch,
      );

      expect((await claudeCodeSends(bridge)).status).toBe(200);

      expect(compatible.calls.map((call) => call.url)).toEqual([
        "https://api.z.ai/api/anthropic/v1/messages?beta=true",
      ]);
      expect(compatible.calls[0]?.headers.get("x-api-key")).toBe(compatibleKey);
      expect(ownHosts.calls).toEqual([]);
    });

    it("drops /v1 from the baseUrl's path only, never from its host", async () => {
      const { ownHosts, compatible } = twoProviders();
      const { bridge } = await openAnthropic(zai("https://v1"), ownHosts.fetch, compatible.fetch);

      await (await claudeCodeSends(bridge)).text();

      expect(compatible.calls[0]?.url).toBe("https://v1/v1/messages?beta=true");
    });

    it("doesn't add /v1 twice, nor keep a trailing slash", async () => {
      const { ownHosts, compatible } = twoProviders();
      const { bridge } = await openAnthropic(
        zai("https://compatible.example/v1/"),
        ownHosts.fetch,
        compatible.fetch,
      );

      await (await claudeCodeSends(bridge)).text();

      expect(compatible.calls[0]?.url).toBe("https://compatible.example/v1/messages?beta=true");
    });

    it.each([
      ["http://localhost:11434", "http://localhost:11434/v1/messages?beta=true"],
      ["http://127.1:8080/anthropic", "http://127.0.0.1:8080/anthropic/v1/messages?beta=true"],
      ["http://[::1]:11434", "http://[::1]:11434/v1/messages?beta=true"],
    ])("allows plain http on this computer: %s", async (baseUrl, called) => {
      const { ownHosts, compatible } = twoProviders();
      const { bridge } = await openAnthropic(zai(baseUrl), ownHosts.fetch, compatible.fetch);

      expect((await claudeCodeSends(bridge)).status).toBe(200);

      expect(compatible.calls.map((call) => call.url)).toEqual([called]);
    });

    it.each([
      ["plain http to another computer", "http://compatible.example/anthropic"],
      ["plain http to a look-alike of this computer", "http://127.0.0.1.compatible.example/x"],
      ["a user name", "https://user-in-address@compatible.example/anthropic"],
      ["a password without a user name", "https://:user-in-address@compatible.example/anthropic"],
      ["a query", "https://compatible.example/anthropic?to=elsewhere.example"],
      ["a fragment", "https://compatible.example/anthropic#x"],
      ["another scheme", "ftp://compatible.example/anthropic"],
      ["no address at all", "compatible.example"],
    ])("refuses a baseUrl with %s, naming neither it nor the key", async (_case, baseUrl) => {
      const { ownHosts, compatible } = twoProviders();
      const { bridge, keysRead } = await openAnthropic(
        zai(baseUrl),
        ownHosts.fetch,
        compatible.fetch,
      );

      const reply = await claudeCodeSends(bridge);
      const text = await reply.text();

      expect(reply.status).toBe(400);
      expect(text).not.toContain("compatible.example");
      expect(text).not.toContain("user-in-address");
      expect(text).not.toContain(compatibleKey);
      expect(keysRead).toEqual([]);
      expect([...ownHosts.calls, ...compatible.calls]).toEqual([]);
    });

    it("refuses a baseUrl call on a server without compatibleFetch, before reading the key", async () => {
      const { ownHosts } = twoProviders();
      const { bridge, keysRead } = await openAnthropic(
        zai("https://api.z.ai/api/anthropic"),
        ownHosts.fetch,
      );

      const reply = await claudeCodeSends(bridge);

      expect(reply.status).toBe(403);
      expect(await reply.text()).not.toContain(compatibleKey);
      expect(keysRead).toEqual([]);
      expect(ownHosts.calls).toEqual([]);
    });

    it("refuses a program that addresses another host, and reads no key", async () => {
      const { ownHosts, compatible } = twoProviders();
      const { bridge, keysRead } = await openAnthropic(
        zai("https://api.z.ai/api/anthropic"),
        ownHosts.fetch,
        compatible.fetch,
      );
      const { hostname: host, port } = new URL(bridge.url);
      const body = JSON.stringify({ model: "glm-5.2", max_tokens: 64, messages: [] });

      const byHost = await send(bridge, "/v1/messages", {
        token: bridge.token,
        headers: { host: "attacker.example", "content-type": "application/json" },
        body,
      });
      const byTarget = await sendPipelined(
        { host, port: Number(port) },
        requestText({
          target: "http://attacker.example/v1/messages",
          host: `${host}:${port}`,
          token: bridge.token,
          headers: { "content-type": "application/json" },
          body,
        }),
      );

      expect(byHost.status).toBe(421);
      expect(statuses(byTarget)).toEqual([421]);
      expect(keysRead).toEqual([]);
      expect([...ownHosts.calls, ...compatible.calls]).toEqual([]);
    });

    it.each<[string, BridgeProviderAccess]>([
      ["a key without a baseUrl", { kind: "key", secret: "zai-key" }],
      ["a subscription", { kind: "sign-in" }],
    ])("sends %s to Anthropic's own host through fetch only", async (_case, access) => {
      const { ownHosts, compatible } = twoProviders();
      const { bridge } = await openAnthropic(access, ownHosts.fetch, compatible.fetch);

      await (await claudeCodeSends(bridge)).text();

      expect(ownHosts.calls.map((call) => call.url)).toEqual([
        "https://api.anthropic.com/v1/messages?beta=true",
      ]);
      expect(compatible.calls).toEqual([]);
    });
  });

  describe("the OpenAI route", () => {
    const openRouter: BridgeProviderAccess = {
      kind: "key",
      secret: "openai-key",
      baseUrl: "https://openrouter.example/api/v1",
      models: ["gpt-5.5"],
    };

    it("sends the call and the key to /responses under the provider's baseUrl", async () => {
      const ownHosts = fakeProvider(() => Response.json({ output: [] }));
      const compatible = fakeProvider(() => Response.json({ output: [] }));
      const { bridge } = await openOpenAi(ownHosts.fetch, openRouter, compatible.fetch);

      expect((await codexSends(bridge, codexRequest)).status).toBe(200);

      expect(compatible.calls.map((call) => call.url)).toEqual([
        "https://openrouter.example/api/v1/responses",
      ]);
      expect(compatible.calls[0]?.headers.get("authorization")).toBe(`Bearer ${openAiKey}`);
      expect(ownHosts.calls).toEqual([]);
    });

    it("records the call with the same cost as at OpenAI's own host", async () => {
      const usage = { input_tokens: 100, output_tokens: 42 };
      const compatible = fakeProvider(() => Response.json({ output: [], usage }));
      const { bridge, recorded } = await openOpenAi(compatible.fetch, openRouter, compatible.fetch);

      await (await codexSends(bridge, codexRequest)).text();
      await waitUntil("recorded to have length 2", () => recorded.length === 2);

      const response = recorded[1] as Extract<BridgeEvent, { type: "llm.response" }>;
      expect(response.cost).toBe((100 * 1.25 + 42 * 10) / 1_000_000);
    });

    it("names the provider file in the run log when the host names it", async () => {
      const usage = { input_tokens: 100, output_tokens: 42 };
      const compatible = fakeProvider(() => Response.json({ output: [], usage }));
      const named = { ...openRouter, providerId: "openrouter" };
      const { bridge, recorded } = await openOpenAi(compatible.fetch, named, compatible.fetch);

      await (await codexSends(bridge, codexRequest)).text();
      await waitUntil("recorded to have length 2", () => recorded.length === 2);

      expect(recorded.map((event) => [event.type, "provider" in event && event.provider])).toEqual([
        ["llm.request", "openrouter"],
        ["llm.response", "openrouter"],
      ]);
    });

    it("goes to OpenAI's own host through fetch for an access without a baseUrl", async () => {
      const ownHosts = fakeProvider(() => Response.json({ output: [] }));
      const compatible = fakeProvider(() => Response.json({ output: [] }));
      const { bridge } = await openOpenAi(ownHosts.fetch, undefined, compatible.fetch);

      await (await codexSends(bridge, codexRequest)).text();

      expect(ownHosts.calls[0]?.url).toBe("https://api.openai.com/v1/responses");
      expect(compatible.calls).toEqual([]);
    });
  });
});
