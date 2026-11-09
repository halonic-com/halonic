// The format of a stored token, as base64url of:
//
//   1 byte    format version, 0x01
//   4 bytes   key id (see token-key.ts)
//   12 bytes  random nonce, new on every seal
//   rest      AES-256-GCM ciphertext with its 16-byte tag
//
// The additional data binds the value to its token name and to the header,
// so a value copied to another name won't open.

import { decodeBase64url, type ErrorKind, encodeBase64url } from "@halonicjs/std";
import type { TokenKey } from "./token-key.ts";

const formatVersion = 1;
const keyIdLength = 4;
const nonceLength = 12;
const tagLength = 16;
const headerLength = 1 + keyIdLength + nonceLength;
const additionalDataPrefix = "halonic-token-v1:";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** A stored token that can't be opened. The message names the token, never its value. */
export class UnreadableTokenError extends Error {
  override readonly name = "UnreadableTokenError";

  /** The token is lost for good, so the user has to connect again. */
  get kind(): ErrorKind {
    return "unauthenticated";
  }
}

/** Encrypts a token's value under its canonical name. */
export async function sealToken(
  tokenKey: TokenKey,
  canonicalName: string,
  value: string,
): Promise<string> {
  const header = new Uint8Array(headerLength);
  header[0] = formatVersion;
  header.set(tokenKey.id, 1);
  header.set(crypto.getRandomValues(new Uint8Array(nonceLength)), 1 + keyIdLength);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: header.subarray(1 + keyIdLength),
      additionalData: additionalData(canonicalName, header),
    },
    tokenKey.key,
    encoder.encode(value),
  );
  const sealed = new Uint8Array(headerLength + ciphertext.byteLength);
  sealed.set(header);
  sealed.set(new Uint8Array(ciphertext), headerLength);
  return encodeBase64url(sealed);
}

/**
 * Decrypts a stored token.
 *
 * @param name the name the caller asked for, used only in error messages
 * @throws UnreadableTokenError when the value is damaged, in an unknown
 *   format, or sealed with a different key
 */
export async function openToken(
  tokenKey: TokenKey,
  name: string,
  canonicalName: string,
  sealed: string,
): Promise<string> {
  const bytes = decodeBase64url(sealed);
  if (bytes === undefined || bytes.length < headerLength + tagLength) {
    throw damaged(name);
  }
  if (bytes[0] !== formatVersion) {
    throw new UnreadableTokenError(
      `The token "${name}" is stored in a format this version doesn't know.`,
    );
  }
  if (!sameBytes(bytes.subarray(1, 1 + keyIdLength), tokenKey.id)) {
    throw new UnreadableTokenError(
      `The token "${name}" was sealed with a different token key than the one configured.`,
    );
  }
  const header = bytes.subarray(0, headerLength);
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: header.subarray(1 + keyIdLength),
        additionalData: additionalData(canonicalName, header),
      },
      tokenKey.key,
      bytes.subarray(headerLength),
    );
    return decoder.decode(plain);
  } catch {
    throw damaged(name);
  }
}

/** A stored token that is damaged or was changed. */
export function damaged(name: string): UnreadableTokenError {
  return new UnreadableTokenError(
    `The token "${name}" is damaged or was changed, so it can't be opened.`,
  );
}

function additionalData(canonicalName: string, header: Uint8Array): Uint8Array<ArrayBuffer> {
  const label = encoder.encode(`${additionalDataPrefix}${canonicalName}`);
  const versionAndKeyId = header.subarray(0, 1 + keyIdLength);
  const data = new Uint8Array(label.length + versionAndKeyId.length);
  data.set(label);
  data.set(versionAndKeyId, label.length);
  return data;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
