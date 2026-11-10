import { constants, type Stats } from "node:fs";
import { chmod, type FileHandle, lstat, mkdir, open } from "node:fs/promises";
import { lstatOrNull } from "./links.ts";

/**
 * Creates the folder for a store's files in the user's profile, or makes an
 * existing one private: only the user may list, read or write it. `mkdir`
 * sets the mode only on a folder it creates, so a folder made earlier by
 * something else gets a `chmod` too (Julian, HAL-2927). On Windows the mode
 * means nothing; the profile folder's own permissions protect it there.
 */
export async function makePrivateFolder(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    await chmod(folder, 0o700);
  }
}

/**
 * A file's text, refusing a symbolic link in its place, so a store's record
 * can't live in a file an agent may edit, such as one in its workspace
 * (Julian, HAL-2927). It looks with `lstat` first, which also catches a
 * Windows junction, and opens with `O_NOFOLLOW` where the system has it, so
 * a link put there in between is refused too.
 *
 * Only a plain file without a second name is read. A hard link is a second name for
 * a file that may sit in a workspace, so it is refused like a symbolic link;
 * a store writes through a rename, so its own files always have one name.
 * Anything else, such as a folder or a named pipe, is refused too, and the
 * file is opened with `O_NONBLOCK` so a named pipe can't hang the open
 * (Liam, HAL-2985). Both checks run again on the open file, in case the
 * file was swapped in between.
 *
 * Only the file itself is checked: a link in the folders above it is
 * followed. A store's folder must therefore sit in the user's profile.
 *
 * @throws the file system's error when the file can't be read, with code
 *   `ENOENT` when there is none
 * @throws RangeError when the file is a link or not a plain file
 */
export async function readUnlinkedFile(file: string): Promise<string> {
  // Keeps a byte order mark, as `readFile` with "utf8" does.
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await readUnlinkedBytes(file));
}

/**
 * A file's bytes, with the same refusals as {@link readUnlinkedFile}: for a
 * log whose torn last line may not be whole UTF-8 yet.
 *
 * @throws the file system's error when the file can't be read, with code
 *   `ENOENT` when there is none
 * @throws RangeError when the file is a link or not a plain file
 */
export async function readUnlinkedBytes(file: string): Promise<Uint8Array> {
  const entry = await lstat(file);
  if (entry.isSymbolicLink()) {
    throw linked(file);
  }
  refuseUnlessPlain(file, entry);
  let handle: FileHandle;
  try {
    handle = await open(file, readFlags);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ELOOP") {
      throw linked(file);
    }
    throw error;
  }
  try {
    refuseUnlessPlain(file, await handle.stat());
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/**
 * Opens a store's log file to read and add to, creating it with mode `600` when
 * there is none. It refuses what {@link readUnlinkedFile} refuses, so an
 * append can't write through a link into a file elsewhere, such as one in a
 * workspace: a symbolic link (also when `O_NOFOLLOW` catches one put there
 * after the `lstat`), a hard link, or anything but a plain file. The caller
 * closes the handle.
 *
 * @throws RangeError when the file is a link or not a plain file
 */
export async function openUnlinkedForAppend(file: string): Promise<FileHandle> {
  const entry = await lstatOrNull(file);
  if (entry?.isSymbolicLink()) {
    throw linked(file);
  }
  if (entry !== null) {
    refuseUnlessPlain(file, entry);
  }
  let handle: FileHandle;
  try {
    handle = await open(file, appendFlags, 0o600);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ELOOP") {
      throw linked(file);
    }
    throw error;
  }
  try {
    refuseUnlessPlain(file, await handle.stat());
  } catch (error) {
    await handle.close();
    throw error;
  }
  return handle;
}

/** Read only, without following a link or waiting on a named pipe, where the system has those flags. */
const readFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/**
 * Add to the end, creating the file, without following a link or waiting on
 * a named pipe. Read too, so the caller can find a torn last line.
 */
const appendFlags =
  constants.O_RDWR |
  constants.O_APPEND |
  constants.O_CREAT |
  (constants.O_NOFOLLOW ?? 0) |
  (constants.O_NONBLOCK ?? 0);

/**
 * Throws unless `entry` is a plain file with no other name.
 *
 * A file with no name at all passes: a `grant` that renames over the file or
 * a `revoke` that deletes it between the open and the check leaves the open
 * file with none. No workspace can reach a file without a name, so reading
 * it is as safe as reading one with a single name, and refusing it would
 * fail a valid `get` or a whole `list` (Liam, HAL-3052).
 */
export function refuseUnlessPlain(file: string, entry: Stats): void {
  if (!entry.isFile()) {
    throw new RangeError(
      `${JSON.stringify(file)} isn't a plain file: the store reads only plain files.`,
    );
  }
  if (entry.nlink > 1) {
    throw new RangeError(
      `${JSON.stringify(file)} is a hard link: the store doesn't read a file with another name.`,
    );
  }
}

function linked(file: string): RangeError {
  return new RangeError(`${JSON.stringify(file)} is a link: the store doesn't follow links.`);
}
