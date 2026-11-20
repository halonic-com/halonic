import { MemorySecretStore } from "@halonicjs/adapter-memory";
import { hostSecretNames, isHalonicSecretName, workspaceSecrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadHostKey, remoteHostKeyName, sharedHostKey } from "./host-key.ts";

// RFC 7748 section 6.1, Alice's key pair: a published vector, not a key anyone uses.
const rfcPrivate = "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a";
const rfcPublic = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a";

const base64url = (hex: string) => Buffer.from(hex, "hex").toString("base64url");

verifies("agent-host.remote-host-key", () => {
  describe("loadHostKey", () => {
    it("makes a key on first use, saves it, and gives the same key after", async () => {
      const store = new MemorySecretStore();
      const first = await loadHostKey(store);
      expect(first.publicKey).toHaveLength(32);
      expect(first.privateKey()).toHaveLength(32);
      expect(await store.get(remoteHostKeyName)).toBe(
        Buffer.from(first.privateKey()).toString("base64url"),
      );
      const again = await loadHostKey(store);
      expect(again.publicKey).toEqual(first.publicKey);
      expect(again.privateKey()).toEqual(first.privateKey());
    });

    it("derives the public key as X25519 does", async () => {
      const store = new MemorySecretStore();
      await store.set(remoteHostKeyName, base64url(rfcPrivate));
      const key = await loadHostKey(store);
      expect(Buffer.from(key.publicKey).toString("hex")).toBe(rfcPublic);
    });

    it("gives a new copy of the private key each time, so a session may zero its own", async () => {
      const store = new MemorySecretStore();
      await store.set(remoteHostKeyName, base64url(rfcPrivate));
      const key = await loadHostKey(store);
      key.privateKey().fill(0);
      expect(Buffer.from(key.privateKey()).toString("hex")).toBe(rfcPrivate);
    });

    it("refuses a saved value that isn't a key, never replaces it, and doesn't repeat it", async () => {
      for (const value of [
        "too-short",
        `${base64url(rfcPrivate)}AA`,
        `${base64url(rfcPrivate).slice(0, 42)}!`,
      ]) {
        const store = new MemorySecretStore();
        await store.set(remoteHostKeyName, value);
        const loading = loadHostKey(store);
        await expect(loading).rejects.toThrow("isn't a 32-byte key");
        await expect(loading).rejects.not.toThrow(value);
        expect(await store.get(remoteHostKeyName)).toBe(value);
      }
    });

    it("makes one key when two first uses come at the same time, through one shared loader", async () => {
      const store = new MemorySecretStore();
      let saves = 0;
      const set = store.set.bind(store);
      store.set = async (name, value) => {
        saves += 1;
        await set(name, value);
      };
      const hostKey = sharedHostKey(store);
      const [first, second] = await Promise.all([hostKey(), hostKey()]);
      expect(saves).toBe(1);
      expect(second.publicKey).toEqual(first.publicKey);
    });

    it("tries again after a shared load failed", async () => {
      const store = new MemorySecretStore();
      await store.set(remoteHostKeyName, "too-short");
      const hostKey = sharedHostKey(store);
      await expect(hostKey()).rejects.toThrow("isn't a 32-byte key");
      await store.set(remoteHostKeyName, base64url(rfcPrivate));
      expect(Buffer.from((await hostKey()).publicKey).toString("hex")).toBe(rfcPublic);
    });

    it("keeps the key under a name no workspace may read", async () => {
      expect(hostSecretNames).toContain(remoteHostKeyName);
      expect(isHalonicSecretName(remoteHostKeyName)).toBe(true);
      await expect(
        workspaceSecrets(new MemorySecretStore()).get(remoteHostKeyName),
      ).rejects.toThrow(RangeError);
    });
  });
});
