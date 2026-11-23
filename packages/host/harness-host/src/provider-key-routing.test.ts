import type { BridgeProviderAccess, DefinitionSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { type ModelAliasRules, ProviderKeyServices } from "./provider-key-services.ts";

/** An invented key, never a real one. */
const key = "halonic-test-key-not-real-5c21";

/** The host pin the alias `pinned` sets. */
const pin = { order: ["deepinfra/fp8"], allow_fallbacks: false, data_collection: "deny" };

/**
 * A workspace with OpenRouter's Anthropic-style API as the keyed provider
 * `openrouter`, the alias `pinned` with a host pin and another extra, and
 * the alias `unpinned` without one.
 */
const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
  "providers/openrouter.yaml": [
    "id: openrouter",
    "type: anthropic",
    "baseUrl: https://openrouter.ai/api",
    "secret: openrouter-key",
    "",
  ].join("\n"),
  "models.yaml": [
    "aliases:",
    "  pinned:",
    "    provider: openrouter",
    "    model: acme/flash",
    `    params: { extra: { provider: ${JSON.stringify(pin)}, top_k: 40 } }`,
    "  unpinned:",
    "    provider: openrouter",
    "    model: acme/flash",
    "",
  ].join("\n"),
};

/** A read-only workspace in memory: the host may not use adapters, not even in tests. */
const source: DefinitionSource = {
  location: "memory:acme",
  list: async () => Object.keys(files).sort(),
  read: async (path) => files[path] ?? null,
  version: async () => "v1",
};

/** The app's alias rules: both aliases resolve to `acme/flash`, keyed at `openrouter` when `keyed` says so. */
function aliasRules(keyed: boolean): ModelAliasRules {
  return {
    providerModel: (_workspace, _hub, name) =>
      ["pinned", "unpinned"].includes(name) ? "acme/flash" : undefined,
    access: async (_workspace, _hub, name) =>
      keyed && ["pinned", "unpinned"].includes(name) ? { providerId: "openrouter" } : undefined,
  };
}

/** The Anthropic access the bridge of a sandboxed Claude Code agent with the `model` gets. */
async function anthropicAccessOf(model: string, keyed = true): Promise<BridgeProviderAccess> {
  const workspace = await loadWorkspace(source);
  const keys = new ProviderKeyServices({
    workspace: () => workspace,
    secrets: { get: async (name) => (name === "openrouter-key" ? key : null) },
    requireKeyMayGo: async () => {},
    missingKeyText: (secret) => `No ${secret}.`,
    aliases: aliasRules(keyed),
  });
  const services = await keys.servicesFor({
    runId: "run-1",
    agentId: "writer",
    hubId: "lab",
    harness: "claude-code",
    model,
    runsOn: "sandbox",
  });
  if (services.providers.anthropic === undefined) throw new Error("No Anthropic access.");
  return services.providers.anthropic;
}

verifies("harness-host.bridge-routing", () => {
  describe("servicesFor", () => {
    it("gives the alias's host pin with its key, and no other extra", async () => {
      const access = await anthropicAccessOf("pinned");

      expect(access).toEqual({
        kind: "key",
        secret: "openrouter-key",
        providerId: "openrouter",
        baseUrl: "https://openrouter.ai/api",
        models: ["acme/flash"],
        routing: pin,
      });
    });

    it("gives no routing for an alias that sets no pin", async () => {
      const access = await anthropicAccessOf("unpinned");

      expect(access).toMatchObject({ kind: "key", providerId: "openrouter" });
      expect(access).not.toHaveProperty("routing");
    });

    it("gives no routing when the key isn't the alias's own", async () => {
      const access = await anthropicAccessOf("pinned", false);

      expect(access).not.toHaveProperty("routing");
    });
  });
});
