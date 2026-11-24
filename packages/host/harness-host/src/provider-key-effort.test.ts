import type { BridgeProviderAccess, DefinitionSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import type { BridgeAgent } from "./bridge-host.ts";
import { type ModelAliasRules, ProviderKeyServices } from "./provider-key-services.ts";

/** An invented key, never a real one. */
const key = "halonic-test-key-not-real-e7f0";

/** A workspace whose alias `cheap` is `acme-flash` at the keyed provider `claude`, at effort `low`. */
const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
  "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
  "models.yaml": [
    "aliases:",
    "  cheap:",
    "    provider: claude",
    "    model: acme-flash",
    "    params: { reasoningEffort: low }",
    "  plain:",
    "    provider: claude",
    "    model: acme-plain",
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

/** The app's alias rules for this workspace: an alias resolves to its model at `claude`. */
const aliases: ModelAliasRules = {
  providerModel: (_workspace, _hub, name) => ({ cheap: "acme-flash", plain: "acme-plain" })[name],
  access: async (_workspace, _hub, name) =>
    ["cheap", "plain"].includes(name) ? { providerId: "claude" } : undefined,
};

/** The Anthropic access the bridge of an agent with `changes` gets. */
async function anthropicAccessOf(changes: Partial<BridgeAgent>): Promise<BridgeProviderAccess> {
  const workspace = await loadWorkspace(source);
  const keys = new ProviderKeyServices({
    workspace: () => workspace,
    secrets: { get: async (name) => (name === "anthropic-key" ? key : null) },
    requireKeyMayGo: async () => {},
    missingKeyText: (secret) => `No ${secret}.`,
    aliases,
  });
  const agent: BridgeAgent = {
    runId: "run-1",
    agentId: "writer",
    hubId: "lab",
    harness: "claude-code",
    runsOn: "sandbox",
    ...changes,
  };
  const services = await keys.servicesFor(agent);
  if (services.providers.anthropic === undefined) throw new Error("No Anthropic access.");
  return services.providers.anthropic;
}

verifies("harness-host.bridge-effort", () => {
  describe("servicesFor", () => {
    it("gives the alias's effort for the model the program asks for", async () => {
      const access = await anthropicAccessOf({ model: "cheap" });

      expect(access).toMatchObject({ kind: "key", efforts: { "acme-flash": "low" } });
    });

    it("lets the agent file's effort win over the alias's", async () => {
      const access = await anthropicAccessOf({ model: "cheap", effort: "high" });

      expect(access).toMatchObject({ efforts: { "acme-flash": "high" } });
    });

    it("gives the agent file's effort to an alias that sets none", async () => {
      const access = await anthropicAccessOf({ model: "plain", effort: "medium" });

      expect(access).toMatchObject({ efforts: { "acme-plain": "medium" } });
    });

    it("gives no efforts when neither sets one, so the program's own effort stays", async () => {
      const access = await anthropicAccessOf({ model: "plain" });

      expect(access).not.toHaveProperty("efforts");
    });

    it("names a model that is no alias as written, on the program's own sign-in", async () => {
      const access = await anthropicAccessOf({
        model: "claude-haiku-5-5",
        effort: "low",
        runsOn: "this-computer",
      });

      expect(access).toEqual({ kind: "sign-in", efforts: { "claude-haiku-5-5": "low" } });
    });
  });
});

verifies("harness-host.run-effort", () => {
  describe("servicesFor", () => {
    it("lets a low run win over the agent file's high effort", async () => {
      const access = await anthropicAccessOf({ model: "plain", effort: "high", runEffort: "low" });

      expect(access).toMatchObject({ kind: "key", efforts: { "acme-plain": "low" } });
    });

    it("keeps the agent file's high effort in a default run", async () => {
      const access = await anthropicAccessOf({
        model: "plain",
        effort: "high",
        runEffort: "default",
      });

      expect(access).toMatchObject({ efforts: { "acme-plain": "high" } });
    });

    it("keeps the agent file's effort when the run names none", async () => {
      const access = await anthropicAccessOf({ model: "plain", effort: "high" });

      expect(access).toMatchObject({ efforts: { "acme-plain": "high" } });
    });

    it("gives a low run the low effort where neither the file nor the alias sets one", async () => {
      const access = await anthropicAccessOf({ model: "plain", runEffort: "low" });

      expect(access).toMatchObject({ efforts: { "acme-plain": "low" } });
    });

    it("keeps the program's own effort in a default run where nothing sets one", async () => {
      const access = await anthropicAccessOf({ model: "plain", runEffort: "default" });

      expect(access).not.toHaveProperty("efforts");
    });
  });
});
