import type { Secrets } from "@halonicjs/ports";
import { bytesToHex, decodeBase64url } from "@halonicjs/std";

/**
 * The deployment's secret that holds the key-encryption key. Under the
 * environment adapter it is `HALONIC_SECRET_USER_SECRETS_KEY`. It must be one
 * of the ports' `deploymentSecretNames` before anything uses this package, so
 * no workspace can read it.
 */
export const keyEncryptionKeySecret = "user-secrets-key";

const keyLength = 32;
const keyIdLabel = new TextEncoder().encode("halonic-user-secrets-key-id\0");

/**
 * The key that wraps every end user's data key, and its id. A wrapped data
 * key records the id, so after a rotation it says which key wrapped it.
 */
export interface KeyEncryptionKey {
  readonly key: CryptoKey;
  /** 8 hex digits, from a hash of the key; never the key itself. */
  readonly id: string;
}

/**
 * Reads `user-secrets-key` and imports it as a non-extractable AES-GCM key.
 *
 * @throws Error when the secret is missing, or isn't 32 bytes in base64url;
 *   the message never holds the value
 */
export async function loadKeyEncryptionKey(secrets: Secrets): Promise<KeyEncryptionKey> {
  const text = await secrets.get(keyEncryptionKeySecret);
  if (text === null) {
    throw new Error(
      `End-user secrets need the secret \`${keyEncryptionKeySecret}\`: ${keyLength} random bytes in base64url.`,
    );
  }
  const raw = decodeBase64url(text.trim());
  if (raw?.length !== keyLength) {
    throw new Error(
      `The secret \`${keyEncryptionKeySecret}\` must be ${keyLength} random bytes in base64url (43 characters, no padding).`,
    );
  }
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  const id = await keyIdOf(raw);
  raw.fill(0);
  return { key, id };
}

/**
 * The first 4 bytes of SHA-256 over a fixed label and the raw key, in hex.
 * The label keeps the id from being a plain hash of the key.
 */
async function keyIdOf(raw: Uint8Array<ArrayBuffer>): Promise<string> {
  const input = new Uint8Array(keyIdLabel.length + raw.length);
  input.set(keyIdLabel);
  input.set(raw, keyIdLabel.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  input.fill(0);
  return bytesToHex(new Uint8Array(digest, 0, 4));
}
