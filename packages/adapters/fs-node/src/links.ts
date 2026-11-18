import type { BigIntStats, Stats } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";

/**
 * The entry at a checked workspace path under `root`, or `null` when there is
 * none. Looks at every segment on the way with `lstat`, so nothing is
 * followed, and refuses a symbolic link in any of them, the last included.
 * Node reports a Windows junction as a symbolic link, so it is refused too.
 *
 * Checking first and acting after leaves a short gap in which another
 * program could swap a folder for a link. The store keeps its own files
 * safe; it doesn't defend against a program that writes into its root.
 *
 * With `bigint`, the stats hold every bit of the file id: as a plain number
 * a Windows file id past 2^53 loses its low bits, so two files can look the same.
 *
 * @throws RangeError when a segment is a link
 */
export async function entryAt(root: string, path: string): Promise<Stats | null>;
export async function entryAt(
  root: string,
  path: string,
  options: { readonly bigint: true },
): Promise<BigIntStats | null>;
export async function entryAt(
  root: string,
  path: string,
  options?: { readonly bigint: true },
): Promise<Stats | BigIntStats | null> {
  let current = root;
  let stats: Stats | BigIntStats | null = null;
  for (const segment of path.split("/")) {
    current = join(current, segment);
    stats = await lstatOrNull(current, options);
    if (stats === null) {
      return null;
    }
    if (stats.isSymbolicLink()) {
      throw new RangeError(
        `Linked workspace path ${JSON.stringify(path)}: the store doesn't follow links.`,
      );
    }
  }
  return stats;
}

/** `lstat`, with `null` for an entry that isn't there, or whose parent is a file. */
export async function lstatOrNull(path: string): Promise<Stats | null>;
export async function lstatOrNull(
  path: string,
  options?: { readonly bigint: true },
): Promise<Stats | BigIntStats | null>;
export async function lstatOrNull(
  path: string,
  options?: { readonly bigint: true },
): Promise<Stats | BigIntStats | null> {
  try {
    return await lstat(path, options);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

/** Whether a file system error means "there is nothing at this path". */
export function isMissing(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
