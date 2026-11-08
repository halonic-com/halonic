import type { RandomBytes } from "@halonicjs/std";

/** A random source that always returns copies of `bytes`, whatever count is asked for. */
export function fixedRandomBytes(bytes: Uint8Array): RandomBytes {
  return () => Uint8Array.from(bytes);
}

/** A random source that returns `count` zero bytes, to prove a wrong count is refused. */
export function wrongCountRandomBytes(count: number): RandomBytes {
  return () => new Uint8Array(count);
}

/** Exactly 43 base64url characters, the shape of every verifier and `state`. */
export const base64urlOf32Bytes = /^[A-Za-z0-9_-]{43}$/;
