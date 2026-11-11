/**
 * The shell's blob commands. Every call names the blob folder by the
 * workspace, a folder the person opened in the shell; the shell works out
 * `<profile>/workspaces/<key>/blobs` itself, as `blobsFolder` in
 * `@halonicjs/profile` does, and keeps each blob as `FolderBlobStore` in
 * `fs-node` keeps it: the file `<first two hex characters>/<hash>`, holding
 * only the bytes. The page never names a path.
 *
 * Every call takes `{ workspace }`, plus the arguments below. Bytes cross
 * the IPC as strict base64url without padding, the rules of
 * `encodeBase64url` in `@halonicjs/std`, since a command's arguments and
 * answer are JSON.
 */
export const blobCommands = {
  /**
   * `{ data }` → `{ hash }`. The shell hashes the bytes itself, so a blob's
   * file always holds the bytes its name says, and writes them to a
   * temporary file in the blob's own folder and renames it into place.
   * Bytes that are already stored are not written again.
   */
  put: "blob_put",
  /** `{ hash }` → the bytes as base64url, or `null` when there is no blob. */
  get: "blob_get",
} as const;

/** Why the shell refused a blob call: the `kind` of its error, which names no secret. */
export const blobRefusalKinds = [
  /** The workspace isn't a folder the person opened in the shell. */
  "folder_not_open",
  /** The hash isn't 64 lowercase hex characters. The page checks it first. */
  "invalid_hash",
  /** The data isn't strict base64url. The page encodes it, so this is a bug. */
  "invalid_data",
  /**
   * The blob's file is a link, a hard link or not a plain file, or its
   * two-character folder is a link or not a folder. The store never reads
   * or writes through one; the message names the file or folder.
   */
  "linked_blob",
  /** Reading or writing the blob folder failed. */
  "io",
] as const;

/** One of {@link blobRefusalKinds}. */
export type BlobRefusalKind = (typeof blobRefusalKinds)[number];

/** What a refused blob command rejects with. */
export interface BlobRefusal {
  readonly kind: BlobRefusalKind;
  readonly message: string;
}

/** Whether a rejection is the shell's blob refusal shape, as opposed to an IPC or permission failure. */
export function isBlobRefusal(reason: unknown): reason is BlobRefusal {
  if (typeof reason !== "object" || reason === null) {
    return false;
  }
  const { kind, message } = reason as Record<string, unknown>;
  return blobRefusalKinds.some((known) => known === kind) && typeof message === "string";
}
