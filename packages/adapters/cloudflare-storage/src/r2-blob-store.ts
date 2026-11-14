import { type BlobRef, type BlobStore, checkBlobMediaType, isBlobHash } from "@halonicjs/ports";
import { bytesToHex } from "@halonicjs/std";

/** Where in the bucket the blobs go, unless the caller names another place. */
const defaultKeyPrefix = "blobs/";

/**
 * The three calls the store makes on an R2 bucket. A Worker's `R2Bucket` binding fits it, and so
 * does a wrapper around one, which a test uses to count the calls.
 */
export interface BlobBucket {
  head(key: string): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(
    key: string,
    value: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
}

/**
 * Blobs as objects in an R2 bucket, each under `<prefix><hash>`. The object
 * holds only the bytes, and carries the media type of the put that wrote it
 * as its `Content-Type`, which the port allows but doesn't promise.
 *
 * A put looks for the object first and writes only when it is missing, so
 * storing the same bytes again costs a read, not a write. A hash that isn't
 * 64 lowercase hex characters never becomes a key: `get` answers `null`
 * without calling R2, so it can't read another object in the bucket.
 *
 * `get` doesn't hash the bytes again: it trusts that only this store writes
 * under its prefix.
 */
export class R2BlobStore implements BlobStore {
  readonly #bucket: BlobBucket;
  readonly #prefix: string;

  /**
   * @param bucket - the R2 binding from the Worker's `env`
   * @param keyPrefix - where in the bucket the blobs live; give each store
   *   sharing a bucket its own, ending in `/`
   */
  constructor(bucket: BlobBucket, keyPrefix: string = defaultKeyPrefix) {
    this.#bucket = bucket;
    this.#prefix = keyPrefix;
  }

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    checkBlobMediaType(mediaType);
    // A copy, so a caller changing `data` while the write waits can't change what is stored.
    // Not `data.slice()`: on a Node `Buffer` that is a view of the same bytes.
    const bytes = new Uint8Array(data);
    const hash = await sha256Hex(bytes);
    const key = this.#keyFor(hash);
    if ((await this.#bucket.head(key)) === null) {
      await this.#bucket.put(key, bytes, { httpMetadata: { contentType: mediaType } });
    }
    return { hash, size: bytes.byteLength, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!isBlobHash(hash)) {
      return null;
    }
    const object = await this.#bucket.get(this.#keyFor(hash));
    return object === null ? null : new Uint8Array(await object.arrayBuffer());
  }

  #keyFor(hash: string): string {
    return `${this.#prefix}${hash}`;
  }
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
