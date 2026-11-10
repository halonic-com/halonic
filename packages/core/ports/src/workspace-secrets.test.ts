import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isHalonicSecretName, type Secrets, workspaceSecrets } from "./index.ts";

const refusal = "A workspace can't pick a secret that belongs to Halonic.";

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
      "openai-key",
      "token-key-backup",
      "my-token-key",
      "serve-password2",
      "halonic-token",
      "halonic_tokens_x",
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
  });
});
