import { createHash, hkdfSync, timingSafeEqual } from "node:crypto";
import {
  checkCodeFromBytes,
  checkCodeInfo,
  checkCodeInputBytes,
  pairCommitInput,
  pairingPskInfo,
  pairingPskInput,
} from "@halonicjs/ports";

/**
 * The hashes around the pairing handshake, as the ADR "Pairing and the
 * end-to-end session" defines them. The codecs are `@halonicjs/ports`'s;
 * only the primitives are here, from `node:crypto`.
 */

const emptySalt = new Uint8Array(0);

/**
 * The Noise psk for a pairing code: HKDF-SHA256 of its ASCII, empty salt,
 * info `halonic pair psk v1`, 32 bytes. Throws a `RangeError` for a code
 * that isn't one.
 */
export function pairingPsk(code: string): Uint8Array {
  return new Uint8Array(hkdfSync("sha256", pairingPskInput(code), emptySalt, pairingPskInfo, 32));
}

/** The check code both screens show, from the pairing handshake's hash. */
export function checkCode(handshakeHash: Uint8Array): string {
  const bytes = hkdfSync("sha256", handshakeHash, emptySalt, checkCodeInfo, checkCodeInputBytes);
  return checkCodeFromBytes(new Uint8Array(bytes));
}

/**
 * The phone's commitment in pairing message 1: SHA-256 of `pairCommitInput`,
 * in base64url without padding. The host recomputes it once message 3
 * decrypts and compares it with {@link sameBytes}.
 */
export function pairCommit(phoneStaticKey: Uint8Array, payload3: Uint8Array): string {
  return createHash("sha256").update(pairCommitInput(phoneStaticKey, payload3)).digest("base64url");
}

/** Compares in constant time, as the host compares anything derived from the code. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
