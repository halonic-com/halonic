import { runDefinitionsIndexFormat } from "@halonicjs/adapter-cloudflare-storage";
import { MemorySecrets } from "@halonicjs/adapter-memory";
import type { ChatTurnRequest, DefinitionSource, HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { cachedRunDefinitionsIndex } from "./indexed-run-definitions.ts";
import { workerModelResolver } from "./worker-model-resolver.ts";

/** The `acme` hub's models as the deployer's index has them: `smart` falls back to `fast`. */
const acmeHub = {
  hubId: "acme",
  settings: null,
  hub: null,
  defaultModel: "fast",
  workflows: {},
  agents: { writer: { id: "writer", model: "smart" } },
  models: {
    smart: {
      provider: "globex",
      model: "large",
      params: {},
      price: { input: 5, output: 25 },
      alias: "smart",
      fallback: [{ provider: "mock", model: "echo", params: {}, alias: "fast" }],
    },
    fast: { provider: "mock", model: "echo", params: {}, alias: "fast", fallback: [] },
  },
  providers: {
    globex: {
      id: "globex",
      type: "openai-compatible",
      baseUrl: "https://models.globex.test/v1",
      secret: "globex-key",
      local: false,
      options: {},
    },
    mock: { id: "mock", type: "mock", local: false, options: {} },
  },
  runtimes: {},
  skills: {},
  knowledge: {},
  collections: {},
  connectors: {},
};

/** The deployed snapshot, whose index has the `acme` hub. */
const snapshot: DefinitionSource = {
  location: "memory:acme",
  list: async () => [],
  read: async (path) =>
    path === "run-definitions.index.json"
      ? JSON.stringify({ format: runDefinitionsIndexFormat, hubs: { acme: acmeHub } })
      : null,
  version: async () => "v1",
};

/** A run's model call in `acme`, as the engine makes it. */
function callOf(fields: Partial<ChatTurnRequest> = {}): ChatTurnRequest {
  return { hubId: "acme", messages: [{ role: "user", content: "Hi" }], tools: [], ...fields };
}

/** The resolver on the snapshot, with the Workers secrets and the HTTP client given. */
function resolverWith(http?: HttpClient) {
  const secrets = new MemorySecrets({ "globex-key": "test-key-not-real" });
  return workerModelResolver({
    readIndex: cachedRunDefinitionsIndex(snapshot),
    secrets,
    ...(http === undefined ? {} : { http }),
  });
}

verifies("runtime.worker-models", () => {
  describe("workerModelResolver", () => {
    it("gives an agent its alias from the index, with the key's name, the price and the fallbacks", async () => {
      const resolve = resolverWith();
      const resolved = await resolve(callOf({ agentId: "writer" }));

      expect(resolved).toMatchObject({
        model: "large",
        alias: "smart",
        secret: "globex-key",
        price: { input: 5, output: 25 },
        local: false,
      });
      expect(resolved.fallback).toMatchObject([{ model: "echo", alias: "fast", local: true }]);
    });

    it("gives a call without a model the hub's default, and takes provider/model directly", async () => {
      const resolve = resolverWith();

      expect(await resolve(callOf())).toMatchObject({ model: "echo", alias: "fast" });
      expect(await resolve(callOf({ alias: "globex/small" }))).toMatchObject({
        model: "small",
        secret: "globex-key",
      });
    });

    it("sends the key from the Workers secrets to the address the deployer's provider file names", async () => {
      const sent: { url: string; authorization: string | null }[] = [];
      const resolve = resolverWith({
        fetch: async (url, init) => {
          sent.push({ url, authorization: new Headers(init?.headers).get("authorization") });
          throw new TypeError("fetch failed");
        },
      });
      const resolved = await resolve(callOf({ agentId: "writer" }));

      await expect(
        resolved.provider.chat({ model: resolved.model, messages: [], tools: [] }),
      ).rejects.toThrow();
      expect(sent).toEqual([
        {
          url: "https://models.globex.test/v1/chat/completions",
          authorization: "Bearer test-key-not-real",
        },
      ]);
    });

    it("refuses unsaved model settings, so no caller picks a secret's address", async () => {
      const sent: string[] = [];
      const resolve = resolverWith({
        fetch: async (url) => {
          sent.push(url);
          throw new TypeError("fetch failed");
        },
      });
      const agent = {
        type: "openai-compatible",
        model: "large",
        local: false,
        baseUrl: "https://their.host.test/v1",
        secret: "globex-key",
      };

      await expect(resolve(callOf({ agent }))).rejects.toThrow("no unsaved model settings");
      expect(sent).toEqual([]);
    });

    it("names an alias the hub doesn't have, and a hub the index doesn't have", async () => {
      const resolve = resolverWith();

      await expect(resolve(callOf({ alias: "constructor" }))).rejects.toMatchObject({
        code: "unknown-model-alias",
      });
      await expect(resolve(callOf({ alias: "constructor/x" }))).rejects.toMatchObject({
        code: "no-provider",
      });
      await expect(resolve(callOf({ hubId: "initech" }))).rejects.toMatchObject({
        name: "RunTargetNotFound",
      });
    });
  });
});
