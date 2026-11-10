import { createHash } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { BlobRef, BlobStore } from "@halonicjs/ports";
import { isMissing, lstatOrNull } from "./links.ts";
import { makePrivateFolder, readUnlinkedBytes } from "./private-files.ts";
import { renameOver } from "./rename-over.ts";
import { temporaryWriteFileName } from "./temporary-write.ts";

/** HTTP token characters (RFC 9110), for each half of `type/subtype`. */
const token = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const mediaTypePattern = new RegExp(`^${token}/${token}$`, "u");
const hashPattern = /^[0-9a-f]{64}$/u;

/**
 * Blobs as files in one folder of the user's profile, such as a workspace's
 * `blobsFolder()`. Each blob is the file `<first two hex characters>/<hash>`,
 * so no folder holds more than a small share of them. The file holds only the
 * bytes: the media type isn't kept, as the port allows.
 *
 * A put writes a temporary file in the blob's own folder and renames it into
 * place, so the rename stays on one disk and a reader sees the whole blob or
 * none. Storing bytes that are already there writes nothing.
 *
 * A hash that isn't 64 lowercase hex characters never reaches a path, and a
 * path is checked to stay inside the folder before it is used. A blob file
 * that is a link, a hard link or not a plain file can't be read (see
 * `readUnlinkedBytes`), and a put replaces it rather than writing through it.
 * A put refuses a blob's two-character folder that is a link. The folder must
 * sit in the profile, never in a workspace.
 *
 * `get` doesn't hash the bytes again: it trusts that only the store writes
 * into its folder.
 */
export class FolderBlobStore implements BlobStore {
  readonly #root: string;

  /** @param root - the folder for the blobs; created on the first put */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    if (!mediaTypePattern.test(mediaType)) {
      throw new RangeError(
        `Media type ${JSON.stringify(mediaType)} is not type/subtype without parameters.`,
      );
    }
    // A copy, so a caller changing `data` while the write waits can't change what is stored.
    // Not `data.slice()`: on Node's Buffer that is a view of the same bytes.
    const bytes = new Uint8Array(data);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const file = this.#fileFor(hash);
    await refuseLinkedFolder(dirname(file));
    if (!(await isStoredBlob(file))) {
      await this.#write(file, bytes);
    }
    return { hash, size: bytes.byteLength, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!hashPattern.test(hash)) {
      return null;
    }
    try {
      // A plain Uint8Array, not Node's Buffer, so callers get the type the port names.
      return new Uint8Array(await readUnlinkedBytes(this.#fileFor(hash)));
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  /** Writes the bytes to a temporary file next to `file` and renames it over `file`. */
  async #write(file: string, bytes: Uint8Array): Promise<void> {
    const folder = dirname(file);
    const temporary = join(folder, temporaryWriteFileName());
    await makePrivateFolder(this.#root);
    await makePrivateFolder(folder);
    try {
      await writeFile(temporary, bytes, { mode: 0o600 });
      await renameOver(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  #fileFor(hash: string): string {
    return blobFile(this.#root, hash);
  }
}

/**
 * The file for a blob under `root`: `<root>/<hash[0..2]>/<hash>`. The store
 * passes only checked hashes, which can't leave the folder; this check makes
 * sure of it where the path is built.
 *
 * @throws RangeError when the path would be outside `root`
 */
export function blobFile(root: string, hash: string): string {
  const file = resolve(root, hash.slice(0, 2), hash);
  const inside = relative(root, file);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new RangeError(`Blob ${JSON.stringify(hash)} would be outside the store's folder.`);
  }
  return file;
}

/**
 * Whether `file` already holds a blob the store wrote: a plain file with one
 * name. A link or anything else in its place is replaced by the next put.
 */
async function isStoredBlob(file: string): Promise<boolean> {
  const entry = await lstatOrNull(file);
  return entry?.isFile() === true && entry.nlink === 1;
}

/**
 * Refuses a blob's folder that is there but isn't a plain folder, such as a
 * symbolic link: `mkdir` and `chmod` would follow it, and the put would
 * write into the folder it points to.
 *
 * @throws RangeError when the folder is a link or not a folder
 */
async function refuseLinkedFolder(folder: string): Promise<void> {
  const entry = await lstatOrNull(folder);
  if (entry !== null && !entry.isDirectory()) {
    throw new RangeError(
      `Blob folder ${JSON.stringify(folder)} is a link or not a folder: the store doesn't follow links.`,
    );
  }
}
