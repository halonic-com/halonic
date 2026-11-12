// Read-only files in a box (HAL-7841). MXC grants folders only, and the folder
// around a file would also open its neighbours, so each read-only file is
// copied into a folder the session owns, and only that folder is granted.
//
//   <box folder>\files\<number>\<file name>   one folder per file, so equal names never meet

import { win32 } from "node:path";
import { isInside } from "./box-policy.ts";
import type { MxcDisk } from "./disk.ts";
import { grantPath } from "./grant-path.ts";

/** Where a read-only file went. */
export interface ReadOnlyCopy {
  /** The file the profile named. */
  original: string;
  /** Its copy in the box folder, which the program reads instead. */
  copy: string;
}

/** The folder of a box folder that holds the copies, and the only part of it the program may read. */
export function readOnlyCopiesFolder(boxFolder: string): string {
  return win32.join(boxFolder, "files");
}

/**
 * Copies each file into its own folder under {@link readOnlyCopiesFolder}.
 * The copies are a snapshot: a change to the original later isn't seen, and
 * the program can't change the copy. Nothing is made when there are no files.
 *
 * @throws when a file is inside a denied path (the copy would hand the program what the profile hides)
 * @throws when the box folder is inside a denied path (the program couldn't read the copies)
 */
export async function copyReadOnlyFiles(
  disk: MxcDisk,
  boxFolder: string,
  files: readonly string[],
  deniedPaths: readonly string[],
): Promise<ReadOnlyCopy[]> {
  if (files.length === 0) return [];
  const folder = readOnlyCopiesFolder(boxFolder);
  if (deniedPaths.some((denied) => isInside(denied, grantPath(folder)))) {
    throw new Error(
      `The session's box folder is inside a denied path, so the read-only files can't be read from it (${folder}).`,
    );
  }
  const copies: ReadOnlyCopy[] = [];
  for (const [index, original] of files.entries()) {
    if (deniedPaths.some((denied) => isInside(denied, original))) {
      throw new Error(
        `The read-only file "${original}" is inside a denied path, so it isn't copied.`,
      );
    }
    const target = win32.join(folder, String(index + 1));
    await disk.makeFolder(target);
    const copy = win32.join(target, win32.basename(original));
    await disk.copyFile(original, copy);
    copies.push({ original, copy });
  }
  return copies;
}
