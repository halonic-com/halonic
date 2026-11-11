import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  isHalonicSecretName,
  isPluginSecretName,
  pluginSecretNamePrefix,
  type Secrets,
  workspaceSecrets,
} from "./index.ts";

const refusal = "A workspace can't pick a secret that belongs to Halonic.";
const pluginRefusal = "A workspace can't pick a secret that belongs to a plugin.";

/** A store that has every name configured, and remembers which names it was asked for. */
function storeOfEverything(): Secrets & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    get: async (name) => {
      asked.push(name);
      return `value of ${name}`;
    },
  };
}

verifies("ports.workspace-secrets", () => {
  describe("workspaceSecrets", () => {
    it.each([
      "token-key",
      "token_key",
      "Token_Key",
      "TOKEN-KEY",
      "serve-password",
      "Serve_Password",
      "SERVE-PASSWORD",
      "halonic_token_google_refresh",
      "Halonic-Token-google_refresh",
      "HALONIC_TOKEN_x",
    ])("refuses %s without asking the store, and doesn't repeat the name", async (name) => {
      const store = storeOfEverything();

      const reading = workspaceSecrets(store).get(name);

      await expect(reading).rejects.toBeInstanceOf(RangeError);
      // The whole message is fixed, so no part of the name can be in it.
      await expect(reading).rejects.toThrow(new RangeError(refusal));
      expect(store.asked).toEqual([]);
    });

    it.each([
      "plugin__weather__acme-key",
      "Plugin__Weather__Acme_Key",
      "plugin-_weather__acme-key",
      "PLUGIN--x",
      "plugin__",
    ])("refuses the plugin secret %s without asking the store", async (name) => {
      const store = storeOfEverything();

      const reading = workspaceSecrets(store).get(name);

      await expect(reading).rejects.toThrow(new RangeError(pluginRefusal));
      expect(store.asked).toEqual([]);
    });

    it.each([
      "openai-key",
      "token-key-backup",
      "my-token-key",
      "serve-password2",
      "halonic-token",
      "halonic_tokens_x",
      "plugin-key",
      "plugin_weather",
      "plugins__weather__acme-key",
      "my-plugin__x",
    ])("reads %s from the store", async (name) => {
      const store = storeOfEverything();

      expect(await workspaceSecrets(store).get(name)).toBe(`value of ${name}`);
      expect(store.asked).toEqual([name]);
    });

    it("gives null for a name that isn't configured", async () => {
      const empty: Secrets = { get: async () => null };

      expect(await workspaceSecrets(empty).get("openai-key")).toBeNull();
    });

    it("refuses a name that breaks the rule with the rule's own RangeError", async () => {
      const store = storeOfEverything();

      await expect(workspaceSecrets(store).get("openai key")).rejects.toThrow(
        'Secret name "openai key" must be',
      );
      expect(store.asked).toEqual([]);
    });
  });

  describe("isHalonicSecretName", () => {
    it("matches by the secretKey form", () => {
      expect(isHalonicSecretName("Serve_Password")).toBe(true);
      expect(isHalonicSecretName("halonic-token-a")).toBe(true);
      expect(isHalonicSecretName("openai-key")).toBe(false);
    });

    it("doesn't count a plugin's secret as Halonic's own", () => {
      expect(isHalonicSecretName("plugin__weather__acme-key")).toBe(false);
    });
  });

  describe("isPluginSecretName", () => {
    it("matches the prefix by the secretKey form", () => {
      expect(pluginSecretNamePrefix).toBe("plugin__");
      expect(isPluginSecretName("plugin__weather__acme-key")).toBe(true);
      expect(isPluginSecretName("Plugin-_Weather")).toBe(true);
      expect(isPluginSecretName("plugin-key")).toBe(false);
    });

    it("refuses a name that breaks the rule", () => {
      expect(() => isPluginSecretName("plugin key")).toThrow(RangeError);
    });
  });
});
