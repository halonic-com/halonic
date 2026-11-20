import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import type { SecretStore } from "@halonicjs/ports";

/** The secret the host's static key is kept under; one of ports' `hostSecretNames`, so no workspace can read it. */
export const remoteHostKeyName = "remote-host-key";

/** The DER prefix of a PKCS #8 X25519 private key; the 32 key bytes follow it. */
const pkcs8X25519Prefix = Buffer.from("302e020100300506032b656e04220420", "hex");
const keyBytes = 32;

/**
 * The host's static X25519 key, the one phones pin (ADR "Pairing and the
 * end-to-end session"). The public half goes in the QR code; the private
 * half only into a Noise session, which zeroes what it is given.
 */
export interface HostKey {
  /** The public key, 32 bytes. */
  readonly publicKey: Uint8Array;
  /** A new copy of the private key, 32 bytes, for one Noise session to take and zero. */
  privateKey(): Uint8Array;
}

/**
 * The host's static key from the secrets port, made and saved on first use
 * (requirement `agent-host.remote-host-key`, build plan decision 10). A
 * saved value that isn't a key is an error, never replaced: a new key would
 * make every paired phone see "Can't confirm your computer".
 *
 * @throws Error when the saved value isn't a 32-byte key, without the value
 */
export async function loadHostKey(store: SecretStore): Promise<HostKey> {
  const saved = await store.get(remoteHostKeyName);
  if (saved !== null) return hostKeyOf(readPrivateKey(saved));
  const made = newPrivateKey();
  await store.set(remoteHostKeyName, Buffer.from(made).toString("base64url"));
  return hostKeyOf(made);
}

function readPrivateKey(saved: string): Uint8Array {
  const bytes = Buffer.from(saved, "base64url");
  // Node's decoder skips characters it doesn't know, so the value must also read back as written.
  if (bytes.length !== keyBytes || bytes.toString("base64url") !== saved) {
    throw new Error(`The saved ${remoteHostKeyName} isn't a 32-byte key in base64url.`);
  }
  return new Uint8Array(bytes);
}

function newPrivateKey(): Uint8Array {
  const { privateKey } = generateKeyPairSync("x25519");
  const der = privateKey.export({ format: "der", type: "pkcs8" });
  return new Uint8Array(der.subarray(pkcs8X25519Prefix.length));
}

function hostKeyOf(privateKey: Uint8Array): HostKey {
  const der = Buffer.concat([pkcs8X25519Prefix, privateKey]);
  const jwk = createPublicKey(createPrivateKey({ key: der, format: "der", type: "pkcs8" })).export({
    format: "jwk",
  });
  const publicKey = new Uint8Array(Buffer.from(String(jwk.x), "base64url"));
  der.fill(0);
  return { publicKey, privateKey: () => Uint8Array.from(privateKey) };
}
