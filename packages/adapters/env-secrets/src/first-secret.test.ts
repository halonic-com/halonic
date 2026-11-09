import { MemorySecrets } from "@halonicjs/adapter-memory";
import type { Secrets } from "@halonicjs/ports";
import { secretsContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { firstSecret } from "./first-secret.ts";

/** Secrets that remember which names they were asked for. */
class AskedSecrets implements Secrets {
  readonly asked: string[] = [];
  readonly #inner: Secrets;

  constructor(values: Readonly<Record<string, string>>) {
    this.#inner = new MemorySecrets(values);
  }

  async get(name: string): Promise<string | null> {
    this.asked.push(name);
    return this.#inner.get(name);
  }
}

/** Secrets whose every read fails, like a locked or broken keychain. */
const brokenStore: Secrets = {
  get: async () => {
    throw new Error("The keychain is locked.");
  },
};

// The chain is a Secrets adapter too, so it passes the same contract: one store and two.
secretsContract("firstSecret, one store", async (values) => firstSecret(new MemorySecrets(values)));
secretsContract("firstSecret, two stores", async (values) =>
  firstSecret(new MemorySecrets({}), new MemorySecrets(values)),
);

verifies("env-secrets.first-secret", () => {
  describe("firstSecret", () => {
    it("gives the first store's value and doesn't ask the next", async () => {
      const env = new AskedSecrets({ openai: "from-env" });
      const keychain = new AskedSecrets({ openai: "from-keychain" });
      expect(await firstSecret(env, keychain).get("openai")).toBe("from-env");
      expect(keychain.asked).toEqual([]);
    });

    it("falls through to the next store when the first has none", async () => {
      const env = new AskedSecrets({});
      const keychain = new AskedSecrets({ openai: "from-keychain" });
      expect(await firstSecret(env, keychain).get("openai")).toBe("from-keychain");
      expect(env.asked).toEqual(["openai"]);
    });

    it("gives null when no store has the secret", async () => {
      const stores = [new AskedSecrets({}), new AskedSecrets({}), new AskedSecrets({})] as const;
      expect(await firstSecret(...stores).get("openai")).toBeNull();
      expect(stores.map((store) => store.asked)).toEqual([["openai"], ["openai"], ["openai"]]);
    });

    it("stops at a store that throws and passes its error on unchanged", async () => {
      const later = new AskedSecrets({ openai: "from-later" });
      await expect(firstSecret(brokenStore, later).get("openai")).rejects.toThrow(
        "The keychain is locked.",
      );
      expect(later.asked).toEqual([]);
    });

    it("refuses a bad name at the first store, so no later store is asked", async () => {
      const later = new AskedSecrets({});
      await expect(firstSecret(new MemorySecrets({}), later).get("bad name")).rejects.toThrow(
        RangeError,
      );
      expect(later.asked).toEqual([]);
    });
  });
});
