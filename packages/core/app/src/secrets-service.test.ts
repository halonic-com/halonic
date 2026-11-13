import { type PasswordHasher, type SecretStore, secretKey } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SecretsService } from "./secrets-service.ts";

/** Keeps secrets in a map, by `secretKey`, remembering the name as last written. */
class MapSecretStore implements SecretStore {
  readonly entries = new Map<string, { name: string; value: string }>();
  async get(name: string) {
    return this.entries.get(secretKey(name))?.value ?? null;
  }
  async set(name: string, value: string) {
    this.entries.set(secretKey(name), { name, value });
  }
  async remove(name: string) {
    this.entries.delete(secretKey(name));
  }
  async names() {
    return [...this.entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, entry]) => entry.name);
  }
}

/** A hasher whose hash shows the password was not stored as it came. */
const hasher: PasswordHasher = {
  hash: async (password) => `hash:${[...password].reverse().join("")}`,
  verify: async (password, hash) => hash === `hash:${[...password].reverse().join("")}`,
  needsRehash: () => false,
};

function setup() {
  const store = new MapSecretStore();
  return { store, secrets: new SecretsService({ store, hasher }) };
}

verifies("app.secrets-service", () => {
  it("saves a secret and lists its name, never its value", async () => {
    const { store, secrets } = setup();
    expect(await secrets.set("openai-key", "sk-live-1")).toEqual({ saved: true });
    await secrets.set("anthropic-key", "sk-live-2");

    expect(await store.get("openai-key")).toBe("sk-live-1");
    expect(await secrets.list()).toEqual(["anthropic-key", "openai-key"]);
  });

  it("refuses the token store's names for set and remove and changes nothing", async () => {
    const { store, secrets } = setup();
    await store.set("token-key", "keep");
    for (const name of ["token-key", "Token_Key", "Halonic-Token-google_refresh"]) {
      expect(await secrets.set(name, "x"), name).toEqual({
        saved: false,
        refusal: "reserved-name",
      });
      expect(await secrets.remove(name), name).toEqual({ saved: false, refusal: "reserved-name" });
    }
    expect(await store.get("token-key")).toBe("keep");
  });

  it("leaves token names out of a listing", async () => {
    const { store, secrets } = setup();
    await store.set("token-key", "k");
    await store.set("halonic_token_google", "t");
    await store.set("openai-key", "v");
    expect(await secrets.list()).toEqual(["openai-key"]);
  });

  it("refuses a bad name, an empty value and an oversized one", async () => {
    const { store, secrets } = setup();
    expect(await secrets.set("1key", "x")).toEqual({ saved: false, refusal: "invalid-name" });
    expect(await secrets.set("open ai", "x")).toEqual({ saved: false, refusal: "invalid-name" });
    expect(await secrets.set("a", "")).toEqual({ saved: false, refusal: "empty-value" });
    expect(await secrets.set("a", "x".repeat(65_537))).toEqual({
      saved: false,
      refusal: "value-too-long",
    });
    expect(await store.names()).toEqual([]);
  });

  it("removes a secret, and succeeds when it isn't saved", async () => {
    const { store, secrets } = setup();
    await secrets.set("openai-key", "v");
    expect(await secrets.remove("openai-key")).toEqual({ saved: true });
    expect(await secrets.remove("openai-key")).toEqual({ saved: true });
    expect(await store.names()).toEqual([]);
  });
});

verifies("app.secrets-serve-password", () => {
  describe("serve-password", () => {
    it("is saved as a hash that verifies the password, and the password is not stored", async () => {
      const { store, secrets } = setup();
      expect(await secrets.set("serve-password", "correct horse", "correct horse")).toEqual({
        saved: true,
      });
      const stored = await store.get("serve-password");
      expect(stored).not.toContain("correct horse");
      expect(await hasher.verify("correct horse", stored ?? "")).toBe(true);
    });

    it("needs the same password twice, in any spelling of the name", async () => {
      const { store, secrets } = setup();
      for (const confirmation of [undefined, "other"]) {
        expect(await secrets.set("Serve_Password", "one", confirmation)).toEqual({
          saved: false,
          refusal: "confirmation-differs",
        });
      }
      expect(await store.names()).toEqual([]);
    });

    it("refuses an empty password and one over 1,024 characters", async () => {
      const { store, secrets } = setup();
      expect(await secrets.set("serve-password", "", "")).toEqual({
        saved: false,
        refusal: "empty-value",
      });
      const long = "p".repeat(1025);
      expect(await secrets.set("serve-password", long, long)).toEqual({
        saved: false,
        refusal: "password-too-long",
      });
      expect(await secrets.set("serve-password", "p".repeat(1024), "p".repeat(1024))).toEqual({
        saved: true,
      });
      expect(await store.names()).toEqual(["serve-password"]);
    });

    it("tells a command which names ask twice, and hashes no other", async () => {
      const { store, secrets } = setup();
      expect(secrets.asksTwice("serve-password")).toBe(true);
      expect(secrets.asksTwice("openai-key")).toBe(false);
      expect(secrets.asksTwice("not a name")).toBe(false);
      await secrets.set("openai-key", "plain");
      expect(await store.get("openai-key")).toBe("plain");
    });
  });
});
