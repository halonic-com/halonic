import type { BridgeRecorder, DefinitionSource } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import {
  type LoadedWorkspace,
  loadWorkspace,
  ManyUsersSubscriptionError,
  manyUsersSubscriptionCode,
} from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { LocalBridgeHost } from "./bridge-host.ts";
import { harnessAgentOf, RecordingBridgeServer } from "./fakes.test-helper.ts";
import { type AccessProviderFile, providerAccessOf } from "./provider-access.ts";
import { ProviderKeyServices } from "./provider-key-services.ts";

const claude: AccessProviderFile = { id: "claude", type: "anthropic", secret: "anthropic-key" };
const keyless: AccessProviderFile = { id: "keyless", type: "anthropic" };
const gpt: AccessProviderFile = { id: "gpt", type: "openai", secret: "openai-key" };
const manyUsers = { deployment: "web" };
const refusal =
  'Deployment "web" lets many people sign in, and this claude-code agent has no provider key, so their runs would use your own sign-in. Add a provider of type anthropic with a secret, and save the key with halonic secret set.';

/** The error `run` throws; fails the test when it throws none. */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected it to throw");
}

/** A read-only workspace in memory: the host may not use adapters, not even in tests. */
function sourceOf(files: Record<string, string>): DefinitionSource {
  return {
    location: "memory:acme",
    list: async () => Object.keys(files).sort(),
    read: async (path) => files[path] ?? null,
    version: async () => "v1",
  };
}

verifies("harness-host.many-users-subscription", () => {
  describe("providerAccessOf in a deployment with many users", () => {
    it.each(["this-computer", "sandbox"] as const)(
      "refuses an agent %s with no keyed provider of its type, with the check's code",
      (runsOn) => {
        const error = thrownBy(() =>
          providerAccessOf({
            harness: "claude-code",
            runsOn,
            providers: [keyless, gpt],
            manyUsers,
          }),
        );

        expect(error).toBeInstanceOf(ManyUsersSubscriptionError);
        expect(error).toMatchObject({ code: manyUsersSubscriptionCode, message: refusal });
        expect(errorKindOf(error)).toBe("invalid_input");
      },
    );

    it("gives an agent on this computer the key of its type's keyed provider, not the sign-in", () => {
      expect(
        providerAccessOf({
          harness: "claude-code",
          runsOn: "this-computer",
          providers: [claude],
          manyUsers,
        }),
      ).toEqual({
        kind: "key",
        provider: "anthropic",
        providerId: "claude",
        secret: "anthropic-key",
      });
    });

    it("still gives an alias's keyed provider's key", () => {
      const zai: AccessProviderFile = { id: "zai", type: "anthropic", secret: "zai-key" };

      expect(
        providerAccessOf({
          harness: "claude-code",
          runsOn: "this-computer",
          providers: [keyless, zai],
          modelProvider: "zai",
          aliasProvider: "zai",
          manyUsers,
        }),
      ).toMatchObject({ kind: "key", providerId: "zai", secret: "zai-key" });
    });

    it("gives the same code as the workspace check", async () => {
      const workspace = await loadWorkspace(
        sourceOf({
          "workspace.yaml": "id: acme\nname: Acme\n",
          "deployments.yaml": "deployments:\n  web:\n    name: Web\n    users: { mode: many }\n",
          "agents/writer.agent.yaml": "name: Writer\nharness: claude-code\n",
        }),
      );
      const error = thrownBy(() =>
        providerAccessOf({ harness: "claude-code", runsOn: "sandbox", providers: [], manyUsers }),
      );

      expect(workspace.issues.map((issue) => issue.code)).toEqual([manyUsersSubscriptionCode]);
      expect(error).toMatchObject({ code: manyUsersSubscriptionCode });
    });
  });

  describe("the key services", () => {
    it("serve a keyed bridge that prices the model at the alias's list price", async () => {
      const workspace = await loadWorkspace(
        sourceOf({
          "workspace.yaml": "id: acme\nname: Acme\n",
          "hubs/support/hub.yaml":
            "id: support\nname: Support\nmodels:\n  smart: { provider: claude, model: acme-model, price: { input: 3, output: 15 } }\n",
          "providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
        }),
      );
      const keys = new ProviderKeyServices({
        workspace: () => workspace,
        secrets: { get: async () => "halonic-test-key-not-real-7d2a" },
        requireKeyMayGo: async () => {},
        missingKeyText: (secret) => `No ${secret}.`,
        aliases: { providerModel: () => undefined, access: async () => undefined },
        manyUsers,
      });

      const services = await keys.servicesFor({
        runId: "run-1",
        agentId: "writer",
        hubId: "support",
        harness: "claude-code",
        runsOn: "this-computer",
        model: "claude/acme-model",
      });

      expect(services.providers.anthropic).toMatchObject({ kind: "key", providerId: "claude" });
      expect(Object.keys(services.prices.anthropic ?? {})).toEqual(["acme-model"]);
    });
  });

  describe("the bridge host", () => {
    it.each(["this-computer", "sandbox"] as const)(
      "opens no bridge and reads no key for an agent %s",
      async (runsOn) => {
        const workspace: LoadedWorkspace = await loadWorkspace(
          sourceOf({
            "workspace.yaml": "id: acme\nname: Acme\n",
            "providers/keyless.yaml": "id: keyless\ntype: anthropic\n",
          }),
        );
        const asked: string[] = [];
        const checked: string[] = [];
        const keys = new ProviderKeyServices({
          workspace: () => workspace,
          secrets: {
            get: async (name) => {
              asked.push(name);
              return null;
            },
          },
          requireKeyMayGo: async (file) => {
            checked.push(file.id);
          },
          missingKeyText: (secret) => `No ${secret}.`,
          aliases: { providerModel: () => undefined, access: async () => undefined },
          manyUsers,
        });
        const server = new RecordingBridgeServer();
        const host = new LocalBridgeHost({
          servers: { sandbox: server, "this-computer": server },
          services: keys,
          reportError: () => {},
        });
        const recorder: BridgeRecorder = { record: async () => {} };

        const opening = host.open(harnessAgentOf("writer", null), recorder, runsOn);

        await expect(opening).rejects.toBeInstanceOf(ManyUsersSubscriptionError);
        expect(server.opened).toEqual([]);
        expect(asked).toEqual([]);
        expect(checked).toEqual([]);
      },
    );
  });
});
