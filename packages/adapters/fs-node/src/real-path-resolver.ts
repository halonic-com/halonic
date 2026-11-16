import { realpath as realpathCallback } from "node:fs";
import { lstat, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type { PathResolver, ResolvedPath } from "@halonicjs/app";

/** Longest name a file system takes; Windows reports a longer one as "not there", not as an error. */
const MAX_NAME_LENGTH = 255;

const nativeRealPath = promisify(realpathCallback.native);

/**
 * Follows every link, junction and short name in `path` the way the system
 * does, and says what it found. A path that isn't there yet gets its nearest
 * existing parent's real path plus the missing names. It fails closed, giving
 * `null`, when it can't tell where the path leads:
 * - any error but "not there" (a loop, a path too long, no permission);
 * - a `..` or `.` in the part that isn't there, which the system would read
 *   after following links, so adding it back would mean something else;
 * - a missing name longer than 255 characters, which no system can create;
 * - a name that is there only as a link to nothing, because a write would
 *   create what it points at.
 *
 * Where a `..` comes after a link, Win32 removes it from the text first and
 * POSIX follows the link first, so the two can give different real paths.
 *
 * It uses the system's own path resolution (`realpath.native`), which on
 * Windows expands 8.3 short names and fixes letter case. A file with more
 * than one name comes back `linked`.
 */
export const resolveRealPath: PathResolver = async (path) => {
  const missing: string[] = [];
  let existing = path;
  for (;;) {
    try {
      const real = await nativeRealPath(existing);
      const linked = missing.length === 0 && (await hasOtherNames(real));
      return { real: join(real, ...missing.reverse()), linked } satisfies ResolvedPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
    }
    // Not there, or a link to nothing: only the first can be added back.
    if (await existsAsLink(existing)) return null;
    const name = basename(existing);
    const parent = dirname(existing);
    if (name === "." || name === ".." || parent === existing) return null;
    if (name.length > MAX_NAME_LENGTH) return null;
    missing.push(name);
    existing = parent;
  }
};

async function existsAsLink(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function hasOtherNames(real: string): Promise<boolean> {
  const stats = await stat(real);
  return stats.isFile() && stats.nlink > 1;
}
