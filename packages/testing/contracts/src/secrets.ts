import type { Secrets, TokenStore } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { invalidSecretNames, longestSecretName } from "./secret-names.ts";

/** Creates the secrets under test, configured with exactly `values`. Read-only adapters are seeded here. */
export type MakeSecrets = (values: Readonly<Record<string, string>>) => Promise<Secrets>;

/** Creates an empty token store under test. */
export type MakeTokenStore = () => Promise<TokenStore>;

/** The contract every {@link Secrets} adapter passes. */
export function secretsContract(name: string, make: MakeSecrets): void {
  describe(`Secrets contract (contracts.secrets): ${name}`, () => {
    it("gives a configured secret, and null for one that isn't", async () => {
      const secrets = await make({ "serve-password": "hash", [longestSecretName]: "long" });
      expect(await secrets.get("serve-password")).toBe("hash");
      expect(await secrets.get(longestSecretName)).toBe("long");
      expect(await secrets.get("token-key")).toBeNull();
    });

    it("treats names that differ only in case or in - versus _ as the same secret", async () => {
      const secrets = await make({ "serve-password": "hash" });
      for (const alias of [
        "SERVE_PASSWORD",
        "Serve-Password",
        "serve_password",
        "SERVE-password",
      ]) {
        expect(await secrets.get(alias), alias).toBe("hash");
      }
    });

    it("refuses a name that breaks the rule with a RangeError", async () => {
      const secrets = await make({});
      for (const bad of invalidSecretNames) {
        await expect(secrets.get(bad), JSON.stringify(bad)).rejects.toThrow(RangeError);
      }
    });
  });
}

/** The contract every {@link TokenStore} adapter passes. */
export function tokenStoreContract(name: string, make: MakeTokenStore): void {
  describe(`TokenStore contract (contracts.token-store): ${name}`, () => {
    it("sets, replaces, reads and removes a token", async () => {
      const tokens = await make();
      expect(await tokens.get("google-refresh")).toBeNull();
      await tokens.set("google-refresh", "one");
      expect(await tokens.get("google-refresh")).toBe("one");
      await tokens.set("google-refresh", "two");
      expect(await tokens.get("google-refresh")).toBe("two");
      await tokens.remove("google-refresh");
      expect(await tokens.get("google-refresh")).toBeNull();
      await tokens.remove("google-refresh");
      await tokens.set(longestSecretName, "long");
      expect(await tokens.get(longestSecretName)).toBe("long");
    });

    it("treats names that differ only in case or in - versus _ as the same token", async () => {
      const tokens = await make();
      await tokens.set("google-refresh", "one");
      expect(await tokens.get("GOOGLE_REFRESH")).toBe("one");
      await tokens.set("Google_Refresh", "two");
      expect(await tokens.get("google-refresh")).toBe("two");
      await tokens.remove("GOOGLE-REFRESH");
      expect(await tokens.get("google_refresh")).toBeNull();
    });

    it("refuses a name that breaks the rule with a RangeError, and changes nothing", async () => {
      const tokens = await make();
      await tokens.set("serve-password", "kept");
      for (const bad of invalidSecretNames) {
        const label = JSON.stringify(bad);
        await expect(tokens.get(bad), label).rejects.toThrow(RangeError);
        await expect(tokens.set(bad, "x"), label).rejects.toThrow(RangeError);
        await expect(tokens.remove(bad), label).rejects.toThrow(RangeError);
      }
      expect(await tokens.get("serve-password")).toBe("kept");
    });
  });
}
