import { open } from "node:fs/promises";

/**
 * Error codes of a file system that can't flush a folder, such as some
 * network file systems. The rename is done there all the same.
 */
const cantFlushCodes = new Set(["EINVAL", "ENOTSUP", "EISDIR"]);

/**
 * Flushes `folder`'s own entry list to disk. A rename into a folder changes
 * the folder, not the file, so flushing the file before the rename isn't
 * enough: after a power cut the folder may still name the old file. Call it
 * after `renameOver` where losing the rename would lose something, such
 * as a key a later write depends on.
 *
 * On Windows a folder can't be opened to flush, and NTFS logs the rename
 * itself, so there it does nothing. A file system that can't flush a folder
 * is not an error either.
 *
 * @param platform - `process.platform`; a test passes `win32` to play Windows
 */
export async function flushFolder(
  folder: string,
  platform: string = process.platform,
): Promise<void> {
  if (platform === "win32") {
    return;
  }
  const handle = await open(folder, "r");
  try {
    await handle.sync();
  } catch (error) {
    if (!cantFlushCodes.has(String((error as { code?: unknown }).code))) {
      throw error;
    }
  } finally {
    await handle.close();
  }
}
