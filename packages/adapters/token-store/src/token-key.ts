import type { Secrets } from "@halonicjs/ports";
import { decodeBase64url } from "@halonicjs/std";

/** The configured secret that holds the key. Under the environment adapter it is `HALONIC_SECRET_TOKEN_KEY`. */
export const tokenKeySecret = "token-key";

const keyLength = 32;
const keyIdLength = 4;
const keyIdLabel = new TextEncoder().encode("halonic-token-key-id\0");

/** The AES-256-GCM key, and the short id that tells which key sealed a value. */
export interface TokenKey {
  readonly key: CryptoKey;
  readonly id: Uint8Array<ArrayBuffer>;
}

/**
 * Reads `token-key` and imports it as a non-extractable AES-GCM key.
 *
 * @throws Error when the secret is missing, or isn't 32 bytes in base64url.
 *   The message never holds the value.
 */
export async function loadTokenKey(secrets: Secrets): Promise<TokenKey> {
  const text = await secrets.get(tokenKeySecret);
  if (text === null) {
    throw new Error(
      `The token key isn't configured. Set the secret \`${tokenKeySecret}\` to ${keyLength} random bytes in base64url.`,
    );
  }
  const raw = decodeBase64url(text.trim());
  if (raw?.length !== keyLength) {
    throw new Error(
      `The secret \`${tokenKeySecret}\` must be ${keyLength} random bytes in base64url (43 characters, no padding).`,
    );
  }
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return { key, id: await keyIdOf(raw) };
}

/**
 * The first 4 bytes of SHA-256 over a fixed label and the raw key. The label
 * keeps the id from being a plain hash of the key.
 */
async function keyIdOf(raw: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const input = new Uint8Array(keyIdLabel.length + raw.length);
  input.set(keyIdLabel);
  input.set(raw, keyIdLabel.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(digest, 0, keyIdLength);
}
