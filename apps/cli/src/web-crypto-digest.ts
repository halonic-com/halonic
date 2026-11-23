// The `Digest` port over Web Crypto, in a file of its own so the engine
// (`local-engine.ts`) uses it without the CLI's profile checks and wording.

import type { Digest } from "@halonicjs/ports";

/** The `Digest` port over Web Crypto, which Node has built in. */
export const webCryptoDigest: Digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    // A copy on its own ArrayBuffer: Web Crypto refuses views of a SharedArrayBuffer.
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
