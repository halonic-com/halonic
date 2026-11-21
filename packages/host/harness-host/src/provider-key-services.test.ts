import type { Provider } from "@halonicjs/format";
import type { DefinitionSource, Secrets } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { beforeEach, describe, expect, it } from "vitest";
import type { BridgeAgent } from "./bridge-host.ts";
import { type ModelAliasRules, ProviderKeyServices } from "./provider-key-services.ts";

/** An invented key: what the test looks for wherever the bridge's failures could show it. */
const key = "halonic-test-key-not-real-5c1e";

/** A read-only workspace in memory: the host may not use adapters, not even in tests. */
function sourceOf(files: Record<string, string>): DefinitionSource {
  return {
    location: "memory:acme",
    list: async () => Object.keys(files).sort(),
    read: async (path) => files[path] ?? null,
    version: async () => "v1",
  };
}

const coder: BridgeAgent = {
  runId: "run-1",
  agentId: "coder",
  hubId: "lab",
  harness: "claude-code",
  runsOn: "sandbox",
  model: "claude/acme-model",
};

let workspace: LoadedWorkspace;
/** The provider files the app's check was given, by id. */
let checked: string[];
/** The secret names the app's secrets were asked for. */
let asked: string[];

beforeEach(async () => {
  workspace = await loadWorkspace(
    sourceOf({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
      "providers/claude.yaml":
        "id: claude\ntype: anthropic\nsecret: anthropic-key\nbaseUrl: https://llm.acme.test/anthropic\n",
    }),
  );
  checked = [];
  asked = [];
});

/** The services on secrets that hold `saved`, with an app check that runs `check`. */
function servicesWith(
  saved: Record<string, string>,
  check: (file: Provider) => Promise<void> = async () => {},
  aliases: ModelAliasRules = noAliases,
): ProviderKeyServices {
  const secrets: Secrets = {
    get: async (name) => {
      asked.push(name);
      return saved[name] ?? null;
    },
  };
  return new ProviderKeyServices({
    workspace: () => workspace,
    secrets,
    requireKeyMayGo: async (file) => {
      checked.push(file.id);
      await check(file);
    },
    missingKeyText: (secret, providerId) => `No ${secret} for ${providerId}.`,
    aliases,
  });
}

/** An app with no model aliases. */
const noAliases: ModelAliasRules = {
  providerModel: () => undefined,
  access: async () => undefined,
};

verifies("harness-host.provider-key-services", () => {
  describe("bridgeSecrets", () => {
    it("answers only a secret a provider file names, and scrubs each value it handed out", async () => {
      const keys = servicesWith({ "anthropic-key": key, "github-token": "other" });

      expect(await keys.bridgeSecrets.get("github-token")).toBeNull();
      expect(await keys.bridgeSecrets.get("anthropic-key")).toBe(key);
      expect(asked).toEqual(["anthropic-key"]);
      expect(keys.scrub(`failed with ${key}`)).toBe("failed with [secret removed]");
    });
  });

  describe("servicesFor", () => {
    it("stops with the app check's message and fix, of its kind, before reading the secret", async () => {
      const keys = servicesWith({ "anthropic-key": key }, async () => {
        throw new KindedError("denied", "provider claude would send its key elsewhere.", {
          fix: "Trust the workspace.",
        });
      });

      const failure = await keys.servicesFor(coder).catch((error: unknown) => error);

      expect(failure).toMatchObject({
        message: "Provider claude would send its key elsewhere. Trust the workspace.",
      });
      expect(errorKindOf(failure)).toBe("denied");
      expect(asked).toEqual([]);
    });

    it("keeps the cause the app's check named, so a screen can still word the refusal", async () => {
      const failureCause = { code: "studio.harness-base-url", detail: { provider: "claude" } };
      const keys = servicesWith({ "anthropic-key": key }, async () => {
        throw Object.assign(new KindedError("invalid_input", "Studio can't reach it yet."), {
          failureCause,
        });
      });

      const failure = await keys.servicesFor(coder).catch((error: unknown) => error);

      expect(failure).toMatchObject({ failureCause });
    });

    it("stops in the app's words when the key's secret holds no value", async () => {
      const keys = servicesWith({});

      const failure = await keys.servicesFor(coder).catch((error: unknown) => error);

      expect(failure).toMatchObject({
        message: "No anthropic-key for claude.",
        failureCause: {
          code: "harness-host.no-key",
          detail: {
            provider: "claude",
            secret: "anthropic-key",
            agent: "coder",
            harness: "claude-code",
          },
        },
      });
      expect(errorKindOf(failure)).toBe("invalid_input");
    });

    it("gives the bridge the key's secret name and address once the app's check passes", async () => {
      const keys = servicesWith({ "anthropic-key": key });

      const services = await keys.servicesFor(coder);

      expect(checked).toEqual(["claude"]);
      expect(services.providers).toEqual({
        anthropic: {
          kind: "key",
          secret: "anthropic-key",
          providerId: "claude",
          baseUrl: "https://llm.acme.test/anthropic",
          models: ["acme-model"],
        },
        openai: { kind: "sign-in" },
      });
      expect(JSON.stringify(services)).not.toContain(key);
    });

    it("checks an alias first, then serves its provider's key on this computer for its model only", async () => {
      workspace = await loadWorkspace(
        sourceOf({
          "workspace.yaml": "id: acme\nname: Acme\n",
          "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
          "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
          "models.yaml": "aliases:\n  careful:\n    provider: claude\n    model: acme-model\n",
        }),
      );
      const order: string[] = [];
      const keys = servicesWith({ "anthropic-key": key }, async () => {}, {
        providerModel: () => "acme-model",
        access: async (_workspace, hubId, name, harness) => {
          order.push(`alias ${hubId}/${name} in ${harness}`);
          return { providerId: "claude" };
        },
      });

      const services = await keys.servicesFor({
        ...coder,
        runsOn: "this-computer",
        model: "careful",
      });

      expect([...order, ...asked]).toEqual(["alias lab/careful in claude-code", "anthropic-key"]);
      expect(services.providers.anthropic).toEqual({
        kind: "key",
        secret: "anthropic-key",
        providerId: "claude",
        models: ["acme-model"],
      });
    });
  });
});
