/** Version of the {@link Digest} port. A breaking change bumps it and comes with an ADR. */
export const digestVersion = 1;

/**
 * Hashes bytes. The core has no hash code of its own: an adapter asks the
 * platform's WebCrypto, which Node, Workers and browsers all have.
 *
 * @example
 * const hash = await digest.sha256(encodeUtf8("abc"));
 * // hash.length === 32
 */
export interface Digest {
  /** The 32-byte SHA-256 of the bytes. The input is not changed. */
  sha256(data: Uint8Array): Promise<Uint8Array>;
}
