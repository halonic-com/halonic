import type { Digest } from "@halonicjs/ports";

/** Lowercase hex SHA-256 of the bytes, with the Web Crypto API that every runtime has. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  // A copy on its own ArrayBuffer: Web Crypto refuses views of a SharedArrayBuffer.
  const input = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  let hex = "";
  for (const byte of digest) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** The {@link Digest} port over the Web Crypto API, for the stores' write-if-unchanged check. */
export const webCryptoDigest: Digest = {
  async sha256(data) {
    // A copy, for the same reason as above.
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
