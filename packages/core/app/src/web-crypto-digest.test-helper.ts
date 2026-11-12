import type { Digest } from "@halonicjs/ports";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
export const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
