import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { UnreadableUserSecretError } from "./envelope.ts";
import { kekFilledWith } from "./fakes.test-helper.ts";
import { MemoryUserSecretStorage, type UserSecretStorage } from "./storage.ts";
import { UserSecrets } from "./user-secrets.ts";

const value = "ghu_acme0123456789abcdef";

/** Everything the storage holds, as one text, to look for the value in it. */
async function everythingStored(storage: UserSecretStorage): Promise<string> {
  const names = await storage.names();
  const sealed = await Promise.all(names.map((name) => storage.get(name)));
  return JSON.stringify([await storage.dataKey(), names, sealed]);
}

verifies("user-secrets.storage", () => {
  describe("UserSecrets", () => {
    it("stores, reads, lists and removes a secret by its secretKey form", async () => {
      const storage = new MemoryUserSecretStorage();
      const secrets = new UserSecrets(await kekFilledWith(1), "eu_acme", storage);

      await secrets.set("github-token", value);

      expect(await secrets.get("GITHUB_TOKEN")).toBe(value);
      expect(await secrets.names()).toEqual(["GITHUB_TOKEN"]);
      await secrets.remove("Github-Token");
      expect(await secrets.get("github-token")).toBeNull();
      expect(await secrets.names()).toEqual([]);
      await secrets.remove("github-token");
    });

    it("keeps only sealed values, never the value in the clear", async () => {
      const storage = new MemoryUserSecretStorage();
      await new UserSecrets(await kekFilledWith(1), "eu_acme", storage).set("github-token", value);

      const stored = await everythingStored(storage);
      expect(stored).not.toContain(value);
      expect(stored).not.toContain(btoa(value).replace(/=+$/, ""));
    });

    it("makes one data key and reuses it, even for two first writes at once", async () => {
      const storage = new MemoryUserSecretStorage();
      const secrets = new UserSecrets(await kekFilledWith(1), "eu_acme", storage);

      await Promise.all([secrets.set("a", "first"), secrets.set("b", "second")]);
      const wrapped = await storage.dataKey();
      await secrets.set("c", "third");

      expect(await storage.dataKey()).toBe(wrapped);
      expect([await secrets.get("a"), await secrets.get("b"), await secrets.get("c")]).toEqual([
        "first",
        "second",
        "third",
      ]);
    });

    it("won't open another user's storage", async () => {
      const kek = await kekFilledWith(1);
      const storage = new MemoryUserSecretStorage();
      await new UserSecrets(kek, "eu_acme", storage).set("github-token", value);

      await expect(new UserSecrets(kek, "eu_globex", storage).get("github-token")).rejects.toThrow(
        UnreadableUserSecretError,
      );
    });

    it("says so when a secret is stored without its data key", async () => {
      const storage = new MemoryUserSecretStorage();
      await storage.put("GITHUB_TOKEN", "us1.1.AAAA");
      const secrets = new UserSecrets(await kekFilledWith(1), "eu_acme", storage);

      await expect(secrets.get("github-token")).rejects.toThrow("data key is missing");
    });

    it.each([
      ["github token", value],
      ["github-token", ""],
    ])("refuses the name %j or an empty value without storing anything", async (name, text) => {
      const storage = new MemoryUserSecretStorage();
      const secrets = new UserSecrets(await kekFilledWith(1), "eu_acme", storage);

      await expect(secrets.set(name, text)).rejects.toBeInstanceOf(RangeError);
      expect(await storage.dataKey()).toBeNull();
    });
  });
});
