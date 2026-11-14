import type { PasswordHasher } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { SecretService } from "./secret-service.ts";
import { TestSecretStore } from "./testing/test-secret-store.ts";

/** Turns a password into `hashed:<password>`, so a test can tell a hash from a password. */
const testHasher: PasswordHasher = {
  hash: async (password) => `hashed:${password}`,
  verify: async (password, hash) => hash === `hashed:${password}`,
  needsRehash: () => false,
};

function setup() {
  const store = new TestSecretStore();
  return { store, secrets: new SecretService({ store, hasher: testHasher }) };
}

verifies("app.secret-service", () => {
  it("saves a secret under its name", async () => {
    const { store, secrets } = setup();

    expect(await secrets.set({ name: "openai-key", value: "sk-live-1234" })).toEqual({
      changed: true,
    });
    expect(await store.get("openai-key")).toBe("sk-live-1234");
  });

  it("removes a secret, and removing one that isn't there succeeds", async () => {
    const { store, secrets } = setup();
    await store.set("openai-key", "sk-live-1234");

    expect(await secrets.remove("openai-key")).toEqual({ changed: true });
    expect(await store.get("openai-key")).toBeNull();
    expect(await secrets.remove("openai-key")).toEqual({ changed: true });
  });

  it.each(["token-key", "Token_Key", "TOKEN_KEY", "halonic_token_abc", "Halonic-Token-abc"])(
    "refuses to set or remove the token name %s",
    async (name) => {
      const { store, secrets } = setup();

      const set = await secrets.set({ name, value: "x" });
      const remove = await secrets.remove(name);

      expect(set.changed).toBe(false);
      expect(remove.changed).toBe(false);
      expect(await store.names()).toEqual([]);
    },
  );

  it("leaves a stored token out of the listing and shows no value", async () => {
    const { store, secrets } = setup();
    await store.set("openai-key", "sk-live-1234");
    await store.set("serve-password", "hashed:x");
    await store.set("halonic_token_abc", "token");
    await store.set("token-key", "key");

    expect(await secrets.list()).toEqual(["openai-key", "serve-password"]);
  });

  it("keeps the sign-in password only as the hasher's hash", async () => {
    const { store, secrets } = setup();

    expect(
      await secrets.set({
        name: "serve-password",
        value: "correct horse",
        confirmation: "correct horse",
      }),
    ).toEqual({ changed: true });
    expect(await store.get("serve-password")).toBe("hashed:correct horse");
  });

  it("refuses a sign-in password typed differently the second time, without repeating either", async () => {
    const { store, secrets } = setup();

    const result = await secrets.set({
      name: "Serve_Password",
      value: "correct horse",
      confirmation: "correct hose",
    });

    expect(result.changed).toBe(false);
    expect(JSON.stringify(result)).not.toContain("correct");
    expect(await store.names()).toEqual([]);
  });

  it("refuses a sign-in password with no confirmation", async () => {
    const { store, secrets } = setup();

    expect((await secrets.set({ name: "serve-password", value: "correct horse" })).changed).toBe(
      false,
    );
    expect(await store.names()).toEqual([]);
  });

  it("refuses an empty sign-in password and one over 1024 characters", async () => {
    const { store, secrets } = setup();
    const tooLong = "p".repeat(1025);

    expect(
      (await secrets.set({ name: "serve-password", value: "", confirmation: "" })).changed,
    ).toBe(false);
    const long = await secrets.set({
      name: "serve-password",
      value: tooLong,
      confirmation: tooLong,
    });
    expect(long.changed).toBe(false);
    expect(JSON.stringify(long)).not.toContain(tooLong);
    expect(await store.names()).toEqual([]);
  });

  it("accepts a sign-in password of exactly 1024 characters", async () => {
    const { secrets } = setup();
    const longest = "p".repeat(1024);

    expect(
      await secrets.set({ name: "serve-password", value: longest, confirmation: longest }),
    ).toEqual({ changed: true });
  });

  it("refuses an empty value and a bad name with a reason that repeats no value", async () => {
    const { store, secrets } = setup();
    const pasted = "sk-live-1234 is not a name";

    const empty = await secrets.set({ name: "openai-key", value: "" });
    const bad = await secrets.set({ name: pasted, value: "v" });

    expect(empty.changed).toBe(false);
    expect(bad.changed).toBe(false);
    expect(await store.names()).toEqual([]);
  });

  it("refuses a name of a pasted key without repeating it", async () => {
    const { secrets } = setup();
    const pasted = `sk-${"é".repeat(40)}`;

    const result = await secrets.remove(pasted);

    expect(result.changed).toBe(false);
    expect(JSON.stringify(result)).not.toContain("é");
  });

  it("lets the sign-in password be removed", async () => {
    const { store, secrets } = setup();
    await store.set("serve-password", "hashed:x");

    expect(await secrets.remove("serve-password")).toEqual({ changed: true });
    expect(await store.get("serve-password")).toBeNull();
  });
});
