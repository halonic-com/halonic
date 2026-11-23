// The `Digest` port over Web Crypto, which names a workspace's folders in the
// profile (`local-engine.ts`).

import type { Digest } from "@halonicjs/ports";

/** The `Digest` port over Web Crypto, which Node has built in. */
export const webCryptoDigest: Digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    // A copy on its own ArrayBuffer: Web Crypto refuses views of a SharedArrayBuffer.
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
