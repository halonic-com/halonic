import type { Secrets } from "@halonicjs/ports";
import * as rig from "@halonicjs/testing-sign-in";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { signInIntegration } from "./app-sign-in-integration.ts";
import { exampleSheet } from "./sign-in-test-kit.test-helper.ts";

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

verifies("agent-host.integration-sign-in-routes", () => {
  describe("an integration's sign-in view of the app's one source", () => {
    it("gives the choices' settings and reads the secret by the sheet's name through the picks", async () => {
      const store = storeOfEverything();
      const choices = {
        settings: { clientId: "fake-client" },
        secretNames: { "example-client": "workspace-key" },
      };
      const integration = signInIntegration(store, {
        read: async () => ({ sheet: exampleSheet(rig), choices }),
      });

      expect((await integration.read()).settings).toEqual({ clientId: "fake-client" });
      expect(await integration.secrets.get("example-client")).toBe("value of workspace-key");
      expect(await integration.secrets.get("other")).toBeNull();
      expect(store.asked).toEqual(["workspace-key"]);
    });

    it("reads a pick that changed after it was built", async () => {
      const store = storeOfEverything();
      let secretNames: Record<string, string> = { "example-client": "first-key" };
      const integration = signInIntegration(store, {
        read: async () => ({ sheet: exampleSheet(rig), choices: { secretNames } }),
      });
      await integration.secrets.get("example-client");

      secretNames = { "example-client": "second-key" };
      await integration.secrets.get("example-client");

      expect(store.asked).toEqual(["first-key", "second-key"]);
    });

    it("doesn't read a pick of one of Halonic's own secrets", async () => {
      const store = storeOfEverything();
      const integration = signInIntegration(store, {
        read: async () => ({
          sheet: exampleSheet(rig),
          choices: { secretNames: { "example-client": "token-key" } },
        }),
      });

      await expect(integration.secrets.get("example-client")).rejects.toBeInstanceOf(RangeError);
      expect(store.asked).toEqual([]);
    });

    it("lets a plugin's backend read only its own secrets", async () => {
      const store = storeOfEverything();
      const integration = signInIntegration(store, {
        plugin: "weather",
        read: async () => ({
          sheet: exampleSheet(rig),
          choices: {
            secretNames: { "example-client": "plugin__weather__client", other: "openai-key" },
          },
        }),
      });

      expect(await integration.secrets.get("example-client")).toBe(
        "value of plugin__weather__client",
      );
      await expect(integration.secrets.get("other")).rejects.toBeInstanceOf(RangeError);
    });
  });
});
