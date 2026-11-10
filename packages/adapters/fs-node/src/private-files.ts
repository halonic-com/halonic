import { constants, type Stats } from "node:fs";
import { chmod, type FileHandle, lstat, mkdir, open } from "node:fs/promises";

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
 * Only a plain file with one name is read. A hard link is a second name for
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
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

/** Read only, without following a link or waiting on a named pipe, where the system has those flags. */
const readFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/** Throws unless `entry` is a plain file with no other name. */
function refuseUnlessPlain(file: string, entry: Stats): void {
  if (!entry.isFile()) {
    throw new RangeError(
      `${JSON.stringify(file)} isn't a plain file: the store reads only plain files.`,
    );
  }
  if (entry.nlink !== 1) {
    throw new RangeError(
      `${JSON.stringify(file)} is a hard link: the store doesn't read a file with another name.`,
    );
  }
}

function linked(file: string): RangeError {
  return new RangeError(`${JSON.stringify(file)} is a link: the store doesn't follow links.`);
}
