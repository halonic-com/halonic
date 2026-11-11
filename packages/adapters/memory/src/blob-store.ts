import { type BlobRef, type BlobStore, checkBlobMediaType, isBlobHash } from "@halonicjs/ports";
import { sha256Hex } from "./sha256.ts";

/** Content-addressed blobs in a map. Bytes are copied in and out, so callers can't change what is stored. */
export class MemoryBlobStore implements BlobStore {
  readonly #blobs = new Map<string, Uint8Array>();

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    checkBlobMediaType(mediaType);
    // Not `slice()`: on a Node `Buffer` it gives a view on the caller's memory, not a copy.
    const copy = new Uint8Array(data);
    const hash = await sha256Hex(copy);
    if (!this.#blobs.has(hash)) {
      this.#blobs.set(hash, copy);
    }
    return { hash, size: copy.byteLength, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!isBlobHash(hash)) {
      return null;
    }
    const stored = this.#blobs.get(hash);
    return stored === undefined ? null : new Uint8Array(stored);
  }
}
