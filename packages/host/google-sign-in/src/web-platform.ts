import type { Digest } from "@halonicjs/ports";
import type { RandomBytes } from "@halonicjs/std";

/** The platform's cryptographically secure randomness, through Web Crypto. */
export const webRandomBytes: RandomBytes = (byteCount) =>
  crypto.getRandomValues(new Uint8Array(byteCount));

/** SHA-256 through Web Crypto. */
export const webDigest: Digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(data)));
  },
};
