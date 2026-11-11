/** Version of the {@link BlobStore} port. A breaking change bumps it and comes with an ADR. */
export const blobStoreVersion = 1;

/** A stored blob: its hash (lowercase hex SHA-256 of the bytes), size in bytes and media type. */
export interface BlobRef {
  hash: string;
  size: number;
  mediaType: string;
}

/**
 * Content-addressed storage for attachments, knowledge files, large event
 * payloads and exports. The same bytes always get the same hash, so storing
 * them twice keeps one copy.
 */
export interface BlobStore {
  /**
   * Stores the bytes and returns their reference, which echoes this call's
   * `mediaType`. Storing the same bytes again with another type keeps one
   * copy, and `get` doesn't promise which type, if any, was kept: callers
   * keep the `BlobRef` they got.
   *
   * @throws RangeError when `mediaType` isn't `type/subtype` made of HTTP
   *   token characters (no parameters, spaces or line breaks), because it
   *   ends up in storage metadata and in a served `Content-Type` header
   */
  put(data: Uint8Array, mediaType: string): Promise<BlobRef>;
  /**
   * The bytes stored under a hash, or `null` when there are none. A hash that
   * isn't 64 lowercase hex characters returns `null` without touching
   * storage, so it can never reach a file path or key (the old Node adapter
   * read `get("../…")` outside its folder).
   */
  get(hash: string): Promise<Uint8Array | null>;
}

/** HTTP token characters (RFC 9110), for each half of `type/subtype`. */
const mediaTypeToken = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const mediaTypePattern = new RegExp(`^${mediaTypeToken}/${mediaTypeToken}$`, "u");
const blobHashPattern = /^[0-9a-f]{64}$/u;

/**
 * Refuses a media type {@link BlobStore.put} must not store: anything but
 * `type/subtype` made of HTTP token characters.
 *
 * @throws RangeError naming the media type
 */
export function checkBlobMediaType(mediaType: string): void {
  if (!mediaTypePattern.test(mediaType)) {
    throw new RangeError(
      `Media type ${JSON.stringify(mediaType)} is not type/subtype without parameters.`,
    );
  }
}

/**
 * Whether a hash can name a blob: 64 lowercase hex characters. Any other
 * is answered with `null` by {@link BlobStore.get} before it reaches storage.
 */
export function isBlobHash(hash: string): boolean {
  return blobHashPattern.test(hash);
}
