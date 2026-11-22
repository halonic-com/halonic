import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  makeDataKey,
  openSecret,
  sealSecret,
  UnreadableUserSecretError,
  unwrapDataKey,
} from "./envelope.ts";
import { kekFilledWith, secretsWithKey } from "./fakes.test-helper.ts";
import { keyEncryptionKeySecret, loadKeyEncryptionKey } from "./key-encryption-key.ts";
import { seal } from "./sealed.ts";

const value = "ghu_acme0123456789abcdef";

verifies("user-secrets.envelope", () => {
  describe("the key-encryption key", () => {
    it("is read from user-secrets-key and imported so it can't be exported", async () => {
      const kek = await kekFilledWith(1);
      expect(keyEncryptionKeySecret).toBe("user-secrets-key");
      expect(kek.key.extractable).toBe(false);
      expect(kek.id).toMatch(/^[0-9a-f]{8}$/);
      expect((await kekFilledWith(2)).id).not.toBe(kek.id);
    });

    it.each([
      [null, "End-user secrets need the secret `user-secrets-key`"],
      ["c2hvcnQ", "must be 32 random bytes in base64url"],
      ["not base64url!", "must be 32 random bytes in base64url"],
    ])("refuses %s without repeating it", async (text, message) => {
      const secrets = secretsWithKey(text);
      const loading = loadKeyEncryptionKey(secrets);
      await expect(loading).rejects.toThrow(message);
      expect(secrets.asked).toEqual(["user-secrets-key"]);
      if (text !== null) {
        await expect(loading).rejects.not.toThrow(text);
      }
    });
  });

  describe("a data key", () => {
    it("is made per user, can't be exported and opens what it sealed", async () => {
      const kek = await kekFilledWith(1);
      const { dataKey, wrapped } = await makeDataKey(kek, "eu_acme", 1);

      expect(dataKey.key.extractable).toBe(false);
      expect(wrapped).toMatch(new RegExp(`^uk1\\.${kek.id}\\.1\\.[A-Za-z0-9_-]+$`));
      const unwrapped = await unwrapDataKey(kek, "eu_acme", wrapped);
      const sealed = await sealSecret(dataKey, "github-token", value);
      expect(sealed).not.toContain(value);
      expect(await openSecret(unwrapped, "GITHUB_TOKEN", sealed)).toBe(value);
    });

    it("is new and random every time, and so is every seal", async () => {
      const kek = await kekFilledWith(1);
      const first = await makeDataKey(kek, "eu_acme", 1);
      const second = await makeDataKey(kek, "eu_acme", 1);
      expect(first.wrapped).not.toBe(second.wrapped);
      expect(await sealSecret(first.dataKey, "a", value)).not.toBe(
        await sealSecret(first.dataKey, "a", value),
      );
    });

    it("says so when another key-encryption key wrapped it", async () => {
      const { wrapped } = await makeDataKey(await kekFilledWith(1), "eu_acme", 1);
      await expect(unwrapDataKey(await kekFilledWith(2), "eu_acme", wrapped)).rejects.toThrow(
        "wrapped with a different key-encryption key",
      );
    });

    it.each([
      ["", 1],
      ["eu_acme", 0],
      ["eu_acme", 1.5],
    ])("refuses the end user %j with version %j", async (endUserId, version) => {
      const kek = await kekFilledWith(1);
      await expect(makeDataKey(kek, endUserId, version)).rejects.toBeInstanceOf(RangeError);
    });
  });

  it.each([
    "uk1.00000000.1",
    "uk2.00000000.1.AAAA",
    "uk1.00000000.0.AAAA",
    "uk1.00000000.1.AAAA.x",
    "uk1.00000000.1.!!",
  ])("refuses the damaged data key %s", async (wrapped) => {
    const kek = await kekFilledWith(1);
    await expect(unwrapDataKey(kek, "eu_acme", wrapped)).rejects.toThrow(
      "damaged or in an unknown format",
    );
  });

  it.each(["us1.1", "us2.1.AAAA", "us1.x.AAAA", "us1.1.AAAA.x", "us1.1.AAAA"])(
    "refuses the damaged secret %s, naming the secret only",
    async (sealed) => {
      const { dataKey } = await makeDataKey(await kekFilledWith(1), "eu_acme", 1);
      const opening = openSecret(dataKey, "github-token", sealed);
      await expect(opening).rejects.toBeInstanceOf(UnreadableUserSecretError);
      await expect(opening).rejects.toThrow('Secret name "github-token" is damaged');
    },
  );

  it.each(["01", "1e0", "0x1", " 1"])(
    "refuses the version %s, which isn't in the one form it writes",
    async (version) => {
      const kek = await kekFilledWith(1);
      const { dataKey, wrapped } = await makeDataKey(kek, "eu_acme", 1);
      const sealed = await sealSecret(dataKey, "github-token", value);
      await expect(
        openSecret(dataKey, "github-token", sealed.replace(/^us1\.1\./, `us1.${version}.`)),
      ).rejects.toThrow(UnreadableUserSecretError);
      const rewrapped = wrapped.replace(/^uk1\.([0-9a-f]+)\.1\./, `uk1.$1.${version}.`);
      await expect(unwrapDataKey(kek, "eu_acme", rewrapped)).rejects.toThrow(
        UnreadableUserSecretError,
      );
    },
  );

  it("says which data key version a secret needs when another one is given", async () => {
    const kek = await kekFilledWith(1);
    const first = await makeDataKey(kek, "eu_acme", 1);
    const second = await makeDataKey(kek, "eu_acme", 2);
    const sealed = await sealSecret(first.dataKey, "github-token", value);
    await expect(openSecret(second.dataKey, "github-token", sealed)).rejects.toThrow(
      "sealed with version 1 of this user's data key, not version 2, so it can't be opened.",
    );
  });

  it("refuses a sealed value that isn't UTF-8 text", async () => {
    // Sealing bytes that aren't UTF-8 needs the same context `sealSecret` uses.
    const { dataKey } = await makeDataKey(await kekFilledWith(1), "eu_acme", 1);
    const sealed = await seal(
      dataKey.key,
      ["halonic-user-secret", 1, "eu_acme", "A", 1],
      new Uint8Array([0xff]),
    );
    await expect(openSecret(dataKey, "a", `us1.1.${encodeBase64url(sealed)}`)).rejects.toThrow(
      UnreadableUserSecretError,
    );
  });
});

verifies("user-secrets.bound-context", () => {
  it("won't unwrap a data key for another end user", async () => {
    const kek = await kekFilledWith(1);
    const { wrapped } = await makeDataKey(kek, "eu_acme", 1);
    await expect(unwrapDataKey(kek, "eu_globex", wrapped)).rejects.toThrow(
      "damaged or isn't this user's",
    );
  });

  it("won't unwrap a data key under another version", async () => {
    const kek = await kekFilledWith(1);
    const { wrapped } = await makeDataKey(kek, "eu_acme", 1);
    const moved = wrapped.replace(/^uk1\.([0-9a-f]+)\.1\./, "uk1.$1.2.");
    await expect(unwrapDataKey(kek, "eu_acme", moved)).rejects.toThrow(UnreadableUserSecretError);
  });

  it("won't open a secret for another end user, even under the same key", async () => {
    const { dataKey } = await makeDataKey(await kekFilledWith(1), "eu_acme", 1);
    const sealed = await sealSecret(dataKey, "github-token", value);
    const sameKeyOtherUser = { ...dataKey, endUserId: "eu_globex" };
    await expect(openSecret(sameKeyOtherUser, "github-token", sealed)).rejects.toThrow(
      UnreadableUserSecretError,
    );
  });

  it("won't open a secret under another name or another key version", async () => {
    const { dataKey } = await makeDataKey(await kekFilledWith(1), "eu_acme", 1);
    const sealed = await sealSecret(dataKey, "github-token", value);
    await expect(openSecret(dataKey, "gitlab-token", sealed)).rejects.toThrow(
      UnreadableUserSecretError,
    );
    const otherVersion = sealed.replace(/^us1\.1\./, "us1.2.");
    await expect(openSecret(dataKey, "github-token", otherVersion)).rejects.toThrow(
      UnreadableUserSecretError,
    );
  });

  it("won't open a secret with another user's data key", async () => {
    const kek = await kekFilledWith(1);
    const acme = await makeDataKey(kek, "eu_acme", 1);
    const globex = await makeDataKey(kek, "eu_globex", 1);
    const sealed = await sealSecret(acme.dataKey, "github-token", value);
    await expect(openSecret(globex.dataKey, "github-token", sealed)).rejects.toThrow(
      UnreadableUserSecretError,
    );
  });
});
