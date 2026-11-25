import type { Sha256 } from "@halonicjs/std";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
export const digest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
