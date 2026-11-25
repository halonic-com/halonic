import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  isHalonicSecretName,
  isServerPairingSecretName,
  type Secrets,
  serverPairingSecretName,
  workspaceSecrets,
  workspaceSecretWriter,
} from "./index.ts";

// A made-up workspace key, built so the secret scan does not read it as a key.
const key = "0f".repeat(16);
const pairing = `server-pairing__${key}`;

verifies("ports.server-pairing-names", () => {
  it("accepts a pairing's name only in its exact form", () => {
    expect(isServerPairingSecretName(pairing)).toBe(true);
    expect(serverPairingSecretName(key)).toBe(pairing);
    for (const other of [
      `Server-Pairing__${key}`,
      `server_pairing__${key}`,
      `server-pairing__${key.toUpperCase()}`,
      `server-pairing__${key}0`,
      `server-pairing__${key.slice(1)}`,
      ` ${pairing}`,
      `${pairing}\n`,
    ]) {
      expect(isServerPairingSecretName(other), other).toBe(false);
    }
  });

  it("builds no name from a key that isn't 32 lower-case hex digits", () => {
    for (const bad of [key.toUpperCase(), key.slice(1), "../x", ""]) {
      expect(() => serverPairingSecretName(bad), bad).toThrow(RangeError);
    }
  });

  it("counts every spelling of the prefix as Halonic's", () => {
    for (const name of [
      pairing,
      `SERVER-PAIRING__${key}`,
      `server-pairing-_${key.toUpperCase()}`,
      "Server_Pairing__x",
    ]) {
      expect(isHalonicSecretName(name), name).toBe(true);
    }
    expect(isHalonicSecretName(`server-pairing-${key}`)).toBe(false);
  });

  it("keeps a workspace's view away from it, without asking the store", async () => {
    const asked: string[] = [];
    const store: Secrets = {
      get: async (name) => {
        asked.push(name);
        return "a-test-value";
      },
    };
    const writer = {
      set: async (name: string) => void asked.push(name),
      remove: async (name: string) => void asked.push(name),
      has: async (name: string) => asked.push(name) > 0,
    };
    const refusal = "A workspace can't pick a secret that belongs to Halonic.";
    await expect(workspaceSecrets(store).get("SERVER-PAIRING__x")).rejects.toThrow(refusal);
    await expect(workspaceSecretWriter(writer).set(pairing, "v")).rejects.toThrow(refusal);
    await expect(workspaceSecretWriter(writer).has(pairing)).rejects.toThrow(refusal);
    expect(asked).toEqual([]);
  });
});
