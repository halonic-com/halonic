import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { pluginSecrets, type Secrets } from "./index.ts";

const refusal = "A plugin can read only the secrets stored for it.";

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

verifies("ports.plugin-secrets", () => {
  describe("pluginSecrets", () => {
    it.each([
      "plugin__weather__acme-key",
      "Plugin__Weather__Acme_Key",
      "PLUGIN__WEATHER__ACME-KEY",
    ])("gives what the store gives for %s, the plugin's own", async (name) => {
      const store = storeOfEverything();
      expect(await pluginSecrets(store, "weather").get(name)).toBe(`value of ${name}`);
      expect(store.asked).toEqual([name]);
    });

    it.each([
      "openai-key",
      "token-key",
      "serve-password",
      "halonic_token_google_refresh",
      "plugin__rain__acme-key",
      "plugin__weather",
      "plugin_weather__acme-key",
    ])("refuses %s without asking the store, and doesn't repeat the name", async (name) => {
      const store = storeOfEverything();
      const reading = pluginSecrets(store, "weather").get(name);
      await expect(reading).rejects.toBeInstanceOf(RangeError);
      await expect(reading).rejects.toThrow(new RangeError(refusal));
      expect(store.asked).toEqual([]);
    });

    it("keeps plugins whose ids differ only by a dash apart", async () => {
      const store = storeOfEverything();
      await expect(pluginSecrets(store, "a").get("plugin__a-b__key")).rejects.toThrow(RangeError);
      await expect(pluginSecrets(store, "a-b").get("plugin__a__key")).rejects.toThrow(RangeError);
      expect(await pluginSecrets(store, "a-b").get("plugin__a-b__key")).toBe(
        "value of plugin__a-b__key",
      );
    });
  });
});
