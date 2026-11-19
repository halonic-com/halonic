import { realpathSync } from "node:fs";
import { basename, dirname, join, win32 } from "node:path";
import { absolutePathsOverlap } from "@halonicjs/std";

/**
 * Whether `a` is on, above or inside `b`: the same path, a folder holding
 * it, or a path inside it. The sandbox lets a read allowance win over a
 * denial on Windows, so a readable folder that overlaps a hidden one in any
 * of these ways would reopen it.
 *
 * A relative path is resolved against this process's folder first, then
 * both are compared as `absolutePathsOverlap` in `@halonicjs/std` compares
 * them: as Windows reads them, on every system. Links are not followed;
 * compare each of {@link bothSpellings} for that.
 *
 * @example
 * pathsOverlap("/person", "/person/.ssh"); // true: it holds the denied folder
 * pathsOverlap("/person/.ssh-notes", "/person/.ssh"); // false
 */
export function pathsOverlap(a: string, b: string): boolean {
  return absolutePathsOverlap(win32.resolve(a), win32.resolve(b));
}

/**
 * The real path of `path`, with every link and junction on the way
 * resolved, also when it doesn't exist yet: the nearest existing parent is
 * resolved and the rest is added back. A path none of whose parents can be
 * read comes back as given.
 */
export function realSpelling(path: string): string {
  const missing: string[] = [];
  let existing = path;
  for (;;) {
    try {
      return join(realpathSync(existing), ...missing.reverse());
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return path;
      missing.push(basename(existing));
      existing = parent;
    }
  }
}

/** `path` as given and as {@link realSpelling} resolves it, once each. */
export function bothSpellings(path: string): string[] {
  return [...new Set([path, realSpelling(path)])];
}
