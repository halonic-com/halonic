import type { BridgeProviderAccess, DefinitionSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { type ModelAliasRules, ProviderKeyServices } from "./provider-key-services.ts";

/** An invented key, never a real one. */
const key = "halonic-test-key-not-real-7d40";

/** The host pins the aliases set. Every one but `collects` keeps the data from being collected. */
const pins = {
  fast: { order: ["deepinfra/fp8"], data_collection: "deny" },
  backup: { order: ["acme-host/fp8"], data_collection: "deny" },
  other: { order: ["acme-other/fp8"], data_collection: "deny" },
  collects: { order: ["acme-cheap/fp8"] },
};

/** One alias of `models.yaml`, as YAML lines. */
function alias(name: string, provider: string, model: string, pin?: object, fallback?: string[]) {
  return [
    `  ${name}:`,
    `    provider: ${provider}`,
    `    model: ${model}`,
    ...(pin === undefined ? [] : [`    params: { extra: { provider: ${JSON.stringify(pin)} } }`]),
    ...(fallback === undefined ? [] : [`    fallback: [${fallback.join(", ")}]`]),
  ];
}

/** A provider file at `baseUrl`, keyed by the secret `openrouter-key`. */
function provider(id: string, baseUrl: string): string {
  return [`id: ${id}`, "type: anthropic", `baseUrl: ${baseUrl}`, "secret: openrouter-key", ""].join(
    "\n",
  );
}

/**
 * A workspace with OpenRouter's Anthropic-style API as the keyed provider
 * `openrouter`, a second provider file `openrouter-team` at the same
 * address, and `acme` at another host. `fast` falls back to aliases of
 * every kind the host has to sort out; `many` to four good ones.
 */
const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
  "providers/openrouter.yaml": provider("openrouter", "https://openrouter.ai/api"),
  "providers/openrouter-team.yaml": provider("openrouter-team", "https://openrouter.ai/api"),
  "providers/acme.yaml": provider("acme", "https://models.acme.example/api"),
  "models.yaml": [
    "aliases:",
    ...alias("fast", "openrouter", "acme/flash", pins.fast, [
      "other-model",
      "team-file",
      "fast-cheap",
      "fast-backup",
    ]),
    ...alias("fast-backup", "openrouter", "acme/flash", pins.backup),
    ...alias("fast-other", "openrouter", "acme/flash", pins.other),
    ...alias("other-model", "openrouter", "acme/pro", pins.backup),
    ...alias("team-file", "openrouter-team", "acme/flash", pins.backup),
    ...alias("fast-cheap", "openrouter", "acme/flash", pins.collects),
    ...alias("many", "openrouter", "acme/flash", pins.fast, [
      "fast-backup",
      "fast-other",
      "fast-backup",
      "fast-other",
    ]),
    ...alias("elsewhere", "acme", "acme/flash", pins.fast, ["elsewhere-backup"]),
    ...alias("elsewhere-backup", "acme", "acme/flash", pins.backup),
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

/** The provider file each alias the agent may name is keyed at, as the app's alias rules give it. */
const keyedAt: Record<string, string> = {
  fast: "openrouter",
  many: "openrouter",
  elsewhere: "acme",
};

/** The app's alias rules: each alias of {@link keyedAt} resolves to `acme/flash`, keyed when `keyed` says so. */
function aliasRules(keyed: boolean): ModelAliasRules {
  return {
    providerModel: (_workspace, _hub, name) => (name in keyedAt ? "acme/flash" : undefined),
    access: async (_workspace, _hub, name) => {
      const providerId = keyedAt[name];
      return keyed && providerId !== undefined ? { providerId } : undefined;
    },
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

verifies("harness-host.bridge-fallback", () => {
  describe("servicesFor", () => {
    it("gives the alias and the same model's fallback at OpenRouter, with its pin", async () => {
      const access = await anthropicAccessOf("fast");

      expect(access).toEqual({
        kind: "key",
        secret: "openrouter-key",
        providerId: "openrouter",
        baseUrl: "https://openrouter.ai/api",
        models: ["acme/flash"],
        routing: pins.fast,
        alias: "fast",
        fallbacks: [{ alias: "fast-backup", routing: pins.backup }],
      });
    });

    it("leaves out another model, another provider file and a pin that keeps the data less safe", async () => {
      const access = await anthropicAccessOf("fast");

      const hops = access.kind === "key" ? access.fallbacks : undefined;
      expect(hops?.map((hop) => hop.alias)).toEqual(["fast-backup"]);
    });

    it("gives at most three fallbacks, in the alias's order", async () => {
      const access = await anthropicAccessOf("many");

      expect(access).toMatchObject({
        alias: "many",
        fallbacks: [
          { alias: "fast-backup", routing: pins.backup },
          { alias: "fast-other", routing: pins.other },
          { alias: "fast-backup", routing: pins.backup },
        ],
      });
    });

    it("gives no alias and no fallbacks at a host other than openrouter.ai", async () => {
      const access = await anthropicAccessOf("elsewhere");

      expect(access).toMatchObject({ kind: "key", providerId: "acme" });
      expect(access).not.toHaveProperty("alias");
      expect(access).not.toHaveProperty("fallbacks");
    });

    it("gives no alias and no fallbacks when the key isn't the alias's own", async () => {
      const access = await anthropicAccessOf("fast", false);

      expect(access).not.toHaveProperty("alias");
      expect(access).not.toHaveProperty("fallbacks");
    });
  });
});
