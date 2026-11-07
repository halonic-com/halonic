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
  /** Stores the bytes and returns their reference. */
  put(data: Uint8Array, mediaType: string): Promise<BlobRef>;
  /** The bytes stored under a hash, or `null` when there are none. */
  get(hash: string): Promise<Uint8Array | null>;
}
