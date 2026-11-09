import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FolderSize } from "@halonicjs/ports";

/**
 * The bytes of the files in `folder` and the folders below it, counting at
 * most `maxFiles` files. Symbolic links and Windows junctions aren't
 * followed or counted. A path where nothing is, or a file, gives 0 bytes,
 * complete, as the memory adapter does.
 *
 * Folders are walked one at a time, so a big folder doesn't open thousands
 * of files at once.
 *
 * @throws Error when a folder can't be read, for example for lack of rights
 */
export async function folderSize(folder: string, maxFiles: number): Promise<FolderSize> {
  const root = await lstatOrUndefined(folder);
  if (root === undefined || !root.isDirectory()) return { bytes: 0, complete: true };

  let bytes = 0;
  let counted = 0;
  const toVisit = [folder];
  for (let current = toVisit.pop(); current !== undefined; current = toVisit.pop()) {
    for (const entry of await readdirOrEmpty(current)) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        toVisit.push(path);
        continue;
      }
      if (!entry.isFile()) continue;
      if (counted === maxFiles) return { bytes, complete: false };
      bytes += (await lstatOrUndefined(path))?.size ?? 0;
      counted += 1;
    }
  }
  return { bytes, complete: true };
}

/** `readdir` with types, or nothing for a folder that went away during the walk. */
async function readdirOrEmpty(folder: string) {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** `lstat`, or `undefined` for an entry that isn't there (any more). */
async function lstatOrUndefined(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** Whether a file system error means "there is nothing at this path". */
export function isMissing(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
