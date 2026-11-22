// Ed25519 keys as the format stores them: a public half as its 32 raw bytes
// and a private half as PKCS #8, both in base64url. Imported keys can't be
// exported again, so a private half read from a secret stays inside WebCrypto.

import { decodeBase64url, err, ok, type Result } from "@halonicjs/std";
import { headerPatterns } from "./format.ts";

/** The signature algorithm, as WebCrypto names it. */
export const algorithm = "Ed25519";

/** A private key with the id it signs under. */
export interface SigningKey {
  readonly id: string;
  readonly privateKey: CryptoKey;
}

/** Why a key couldn't be read. */
export type KeyRefusal = "bad_key_id" | "not_base64url" | "not_an_ed25519_key";

const publicKeyByteCount = 32;

/**
 * Reads a public key from its 32 raw bytes in base64url.
 *
 * @param text - the public half in base64url
 * @returns a key that can only verify, or why it can't be read
 */
export async function importPublicKey(text: string): Promise<Result<CryptoKey, KeyRefusal>> {
  const bytes = decodeBase64url(text);
  if (bytes === undefined) {
    return err("not_base64url");
  }
  if (bytes.length !== publicKeyByteCount) {
    return err("not_an_ed25519_key");
  }
  return importOrRefuse(() => crypto.subtle.importKey("raw", bytes, algorithm, false, ["verify"]));
}

/**
 * Reads a private key from PKCS #8 in base64url, under its key id.
 *
 * @param id - the key id the signatures name
 * @param text - the private half, PKCS #8 in base64url
 * @returns a key that can only sign and can't be exported, or why it can't be read
 */
export async function importSigningKey(
  id: string,
  text: string,
): Promise<Result<SigningKey, KeyRefusal>> {
  if (!headerPatterns.keyId.test(id)) {
    return err("bad_key_id");
  }
  const bytes = decodeBase64url(text);
  if (bytes === undefined) {
    return err("not_base64url");
  }
  const imported = await importOrRefuse(() =>
    crypto.subtle.importKey("pkcs8", bytes, algorithm, false, ["sign"]),
  );
  return imported.ok ? ok({ id, privateKey: imported.value }) : imported;
}

async function importOrRefuse(
  importKey: () => Promise<CryptoKey>,
): Promise<Result<CryptoKey, KeyRefusal>> {
  try {
    return ok(await importKey());
  } catch {
    // WebCrypto throws for bytes that aren't a key of this algorithm.
    return err("not_an_ed25519_key");
  }
}
