// Envelope encryption for one end user's secrets.
//
// A wrapped data key is `uk1.<kek id>.<key version>.<sealed key>` and a sealed
// secret is `us1.<key version>.<sealed value>`, each sealed part in base64url.
// The additional data binds a wrapped data key to its end user, key version and
// key-encryption key, and a secret to its end user, its name and the version of
// the data key that sealed it, so neither opens when it is copied to another
// user, another name or another version.

import { describeSecretName, secretKey } from "@halonicjs/ports";
import { decodeBase64url, encodeBase64url } from "@halonicjs/std";
import type { KeyEncryptionKey } from "./key-encryption-key.ts";
import { type Bytes, open, type SealContext, seal } from "./sealed.ts";

const dataKeyFormat = "uk1";
const secretFormat = "us1";
const dataKeyLength = 32;
const encoder = new TextEncoder();
// `ignoreBOM: false` is the default; workerd's types ask for it.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

/** A stored data key or secret that won't open. The message names the secret, never a value. */
export class UnreadableUserSecretError extends Error {
  override readonly name = "UnreadableUserSecretError";
}

/** One end user's data key, unwrapped: non-extractable, and only for the user and version it was made for. */
export interface DataKey {
  readonly key: CryptoKey;
  readonly endUserId: string;
  readonly version: number;
}

/**
 * Makes a new random data key for an end user and wraps it with the
 * key-encryption key. Store `wrapped`; use `dataKey` right away.
 *
 * @throws RangeError when the end user's id is empty or the version isn't a positive whole number
 */
export async function makeDataKey(
  kek: KeyEncryptionKey,
  endUserId: string,
  version: number,
): Promise<{ readonly dataKey: DataKey; readonly wrapped: string }> {
  checkEndUser(endUserId, version);
  const raw = crypto.getRandomValues(new Uint8Array(dataKeyLength));
  const sealed = await seal(kek.key, dataKeyContext(kek.id, endUserId, version), raw);
  const key = await importDataKey(raw);
  raw.fill(0);
  const wrapped = [dataKeyFormat, kek.id, version, encodeBase64url(sealed)].join(".");
  return { dataKey: { key, endUserId, version }, wrapped };
}

/**
 * Unwraps a stored data key for the end user it was made for.
 *
 * @throws UnreadableUserSecretError when it is damaged, was wrapped by another
 *   key-encryption key, or was made for another end user
 */
export async function unwrapDataKey(
  kek: KeyEncryptionKey,
  endUserId: string,
  wrapped: string,
): Promise<DataKey> {
  const [format, kekId, versionText, sealedText, ...rest] = wrapped.split(".");
  const version = Number(versionText);
  const sealed = sealedText === undefined ? undefined : decodeBase64url(sealedText);
  if (format !== dataKeyFormat || rest.length > 0 || !isVersion(version) || sealed === undefined) {
    throw new UnreadableUserSecretError("The stored data key is damaged or in an unknown format.");
  }
  if (kekId !== kek.id) {
    throw new UnreadableUserSecretError(
      "The stored data key was wrapped with a different key-encryption key than the one configured.",
    );
  }
  const raw = await open(kek.key, dataKeyContext(kekId, endUserId, version), sealed, (cause) => {
    return new UnreadableUserSecretError("The stored data key is damaged or isn't this user's.", {
      cause,
    });
  });
  const key = await importDataKey(raw);
  raw.fill(0);
  return { key, endUserId, version };
}

/**
 * Encrypts a secret's value with the data key, bound to the end user, the
 * secret's name in `secretKey` form and the data key's version.
 *
 * @throws RangeError when the name breaks the secret name rule
 */
export async function sealSecret(dataKey: DataKey, name: string, value: string): Promise<string> {
  const context = secretContext(dataKey.endUserId, secretKey(name), dataKey.version);
  const sealed = await seal(dataKey.key, context, encoder.encode(value));
  return [secretFormat, dataKey.version, encodeBase64url(sealed)].join(".");
}

/**
 * Decrypts a sealed secret with the data key it was sealed with.
 *
 * @throws UnreadableUserSecretError when it is damaged, or was sealed for
 *   another end user, another name or another version of the data key; the
 *   message names the secret, never its value
 */
export async function openSecret(
  dataKey: DataKey,
  name: string,
  sealedSecret: string,
): Promise<string> {
  const unreadable = (cause?: unknown) =>
    new UnreadableUserSecretError(
      `${describeSecretName(name)} is damaged or isn't this user's, so it can't be opened.`,
      { cause },
    );
  const [format, versionText, sealedText, ...rest] = sealedSecret.split(".");
  const version = Number(versionText);
  const sealed = sealedText === undefined ? undefined : decodeBase64url(sealedText);
  if (format !== secretFormat || rest.length > 0 || !isVersion(version) || sealed === undefined) {
    throw unreadable();
  }
  const context = secretContext(dataKey.endUserId, secretKey(name), version);
  const plain = await open(dataKey.key, context, sealed, unreadable);
  try {
    return decoder.decode(plain);
  } catch (error) {
    throw unreadable(error);
  }
}

function dataKeyContext(kekId: string, endUserId: string, version: number): SealContext {
  return ["halonic-user-data-key", 1, kekId, endUserId, version];
}

function secretContext(endUserId: string, canonicalName: string, version: number): SealContext {
  return ["halonic-user-secret", 1, endUserId, canonicalName, version];
}

async function importDataKey(raw: Bytes): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function isVersion(version: number): boolean {
  return Number.isSafeInteger(version) && version > 0;
}

function checkEndUser(endUserId: string, version: number): void {
  if (endUserId === "") {
    throw new RangeError("A data key needs the end user's id.");
  }
  if (!isVersion(version)) {
    throw new RangeError("A data key's version must be a positive whole number.");
  }
}
