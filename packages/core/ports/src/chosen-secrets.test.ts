import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chosenSecrets, type Secrets } from "./index.ts";

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

verifies("ports.chosen-secrets", () => {
  describe("chosenSecrets", () => {
    it("reads the secret picked for the sheet's name", async () => {
      const store = storeOfEverything();

      const secrets = chosenSecrets(store, { "client-secret": "acme-client" });

      expect(await secrets.get("client-secret")).toBe("value of acme-client");
      expect(store.asked).toEqual(["acme-client"]);
    });

    it("gives null for a name nothing was picked for, without asking the store", async () => {
      const store = storeOfEverything();

      expect(
        await chosenSecrets(store, { "client-secret": "acme-client" }).get("other"),
      ).toBeNull();
      expect(store.asked).toEqual([]);
    });

    it("does not read a name that is only in the store, not in the picks", async () => {
      const store = storeOfEverything();

      expect(await chosenSecrets(store, {}).get("acme-client")).toBeNull();
      expect(store.asked).toEqual([]);
    });

    it("refuses a pick of one of Halonic's own secrets", async () => {
      const store = storeOfEverything();

      const reading = chosenSecrets(store, { "client-secret": "token-key" }).get("client-secret");

      await expect(reading).rejects.toBeInstanceOf(RangeError);
      expect(store.asked).toEqual([]);
    });

    it("refuses a workspace's pick of a plugin's secret", async () => {
      const store = storeOfEverything();

      const reading = chosenSecrets(store, { key: "plugin__weather__acme-key" }).get("key");

      await expect(reading).rejects.toBeInstanceOf(RangeError);
      expect(store.asked).toEqual([]);
    });

    it("lets a plugin read its own secrets and no others", async () => {
      const store = storeOfEverything();
      const secrets = chosenSecrets(
        store,
        { key: "plugin__weather__acme-key", other: "openai-key" },
        "weather",
      );

      expect(await secrets.get("key")).toBe("value of plugin__weather__acme-key");
      await expect(secrets.get("other")).rejects.toBeInstanceOf(RangeError);
      expect(store.asked).toEqual(["plugin__weather__acme-key"]);
    });
  });
});
