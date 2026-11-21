// The `Digest` port over Web Crypto, which Node has built in, for the trust
// fingerprint and the workspace's profile folder name.

import type { Digest } from "@halonicjs/ports";

/** SHA-256 over Web Crypto, as the CLI's and the agent host's own digests compute it. */
export const webCryptoDigest: Digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    // A copy on its own ArrayBuffer: Web Crypto refuses views of a SharedArrayBuffer.
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
