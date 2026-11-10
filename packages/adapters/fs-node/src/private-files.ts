import { constants } from "node:fs";
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
 * @throws the file system's error when the file can't be read, with code
 *   `ENOENT` when there is none
 * @throws RangeError when the file is a link
 */
export async function readUnlinkedFile(file: string): Promise<string> {
  if ((await lstat(file)).isSymbolicLink()) {
    throw linked(file);
  }
  let handle: FileHandle;
  try {
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ELOOP") {
      throw linked(file);
    }
    throw error;
  }
  try {
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function linked(file: string): RangeError {
  return new RangeError(`${JSON.stringify(file)} is a link: the store doesn't follow links.`);
}
