// Where a path a harness program names really is on this computer, for the
// ask policy (HAL-14992). The host layer can't use Node, so the CLI and the
// agent host pass this in as the policy's path resolver.

import { lstat, realpath, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** A path after links are followed: the ask policy's `ResolvedPath`. */
export interface ResolvedRealPath {
  /** The real path; for a path that isn't there yet, its nearest existing parent's real path plus the rest. */
  readonly real: string;
  /** `true` for a file more than one name points at (a hard link), so its real path says nothing about where else it is. */
  readonly linked: boolean;
}

/** How deep a path may go before the lookup gives up. */
const maxDepth = 4096;

/**
 * Follows `path`'s links as the operating system does (requirement
 * `harness-kit.real-path`). A path that isn't there yet gets its nearest
 * existing parent's real path plus the rest, so a new file under a linked
 * folder resolves to where the write would land. It gives `null` when it
 * can't say where the path is: a dangling link, a `.` or `..` in the part
 * that isn't there (the system resolves those after the links, so folding
 * them by name could point inside while the write lands outside), or any
 * error other than "not there".
 */
export async function resolveRealPath(path: string): Promise<ResolvedRealPath | null> {
  const rest: string[] = [];
  let current = path;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const found = await realPathOf(current);
    if (found === "error") return null;
    if (found !== "missing")
      return rest.length === 0
        ? await withLinks(found)
        : {
            real: join(found, ...rest.toReversed()),
            linked: false,
          };
    // A name that is there but leads nowhere is a dangling link: a write would follow it.
    if (await isThere(current)) return null;
    const name = basename(current);
    const parent = dirname(current);
    if (parent === current || name === "." || name === "..") return null;
    rest.push(name);
    current = parent;
  }
  return null;
}

/** The real path, `missing` when nothing is there, or `error`. */
async function realPathOf(path: string): Promise<string | "missing" | "error"> {
  try {
    return await realpath(path);
  } catch (error) {
    return isMissing(error) ? "missing" : "error";
  }
}

/** The file's real path, and whether more than one name points at it. */
async function withLinks(real: string): Promise<ResolvedRealPath | null> {
  try {
    const info = await stat(real);
    return { real, linked: info.isFile() && info.nlink > 1 };
  } catch {
    return null;
  }
}

/** Whether something, even a link that leads nowhere, has this name. */
async function isThere(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function isMissing(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  return code === "ENOENT" || code === "ENOTDIR";
}
