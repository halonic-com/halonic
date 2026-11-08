import type { BlobRef, BlobStore } from "@halonicjs/ports";
import { sha256Hex } from "./sha256.ts";

/** HTTP token characters (RFC 9110), for each half of `type/subtype`. */
const token = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const mediaTypePattern = new RegExp(`^${token}/${token}$`);
const hashPattern = /^[0-9a-f]{64}$/;

/** Content-addressed blobs in a map. Bytes are copied in and out, so callers can't change what is stored. */
export class MemoryBlobStore implements BlobStore {
  readonly #blobs = new Map<string, Uint8Array>();

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    if (!mediaTypePattern.test(mediaType)) {
      throw new RangeError(
        `Media type ${JSON.stringify(mediaType)} is not type/subtype without parameters.`,
      );
    }
    const copy = data.slice();
    const hash = await sha256Hex(copy);
    if (!this.#blobs.has(hash)) {
      this.#blobs.set(hash, copy);
    }
    return { hash, size: copy.byteLength, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!hashPattern.test(hash)) {
      return null;
    }
    return this.#blobs.get(hash)?.slice() ?? null;
  }
}
