/**
 * Refuses a workspace path the `DefinitionSource` port calls unsafe: one that
 * is absolute, has a `.`, `..` or empty segment, or contains a backslash or
 * NUL. Checked before the store is touched, so `a/./b` can never mean `a/b`.
 *
 * @throws RangeError naming the path and what is wrong with it
 */
export function checkWorkspacePath(path: string): void {
  if (path.includes("\\") || path.includes("\u0000")) {
    throw new RangeError(`Unsafe workspace path ${JSON.stringify(path)}: no backslash or NUL.`);
  }
  if (path.startsWith("/")) {
    throw new RangeError(`Unsafe workspace path ${JSON.stringify(path)}: it must be relative.`);
  }
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new RangeError(
        `Unsafe workspace path ${JSON.stringify(path)}: no empty, "." or ".." segment.`,
      );
    }
  }
}

/**
 * Refuses an unsafe path, as {@link checkWorkspacePath} does, and also a
 * private one (see {@link isPrivatePath}). Every method that takes a path
 * calls this.
 *
 * @throws RangeError naming the path and what is wrong with it
 */
export function checkPublicWorkspacePath(path: string): void {
  checkWorkspacePath(path);
  if (isPrivatePath(path)) {
    throw new RangeError(
      `Private workspace path ${JSON.stringify(path)}: the store doesn't serve it.`,
    );
  }
}

/** Code points HFS+ ignores in a name, as in git's `next_hfs_char`. */
const hfsIgnored = /[\u200C-\u200F\u202A-\u202E\u206A-\u206F\uFEFF]/gu;

/**
 * Whether a safe path has a private segment, as the port defines it: after
 * removing the code points HFS+ ignores, ignoring case and removing trailing
 * dots and spaces, `.git`, `.studio`, `.env`, `.envrc` or `.env.` and more;
 * or, whatever its name, a segment with a `:` (an NTFS stream) or a `~`
 * followed by a digit (an 8.3 short name).
 */
export function isPrivatePath(path: string): boolean {
  return path.split("/").some(isPrivateSegment);
}

function isPrivateSegment(segment: string): boolean {
  if (segment.includes(":") || /~\d/u.test(segment)) {
    return true;
  }
  const name = segment
    .replace(hfsIgnored, "")
    // Upper case first, so letters that fold to ASCII on some file system match
    // too: a long s to `s`, an `st` ligature to `st`, a dotless i to `i`.
    .toUpperCase()
    .toLowerCase()
    .replace(/[. ]+$/u, "");
  return (
    name === ".git" ||
    name === ".studio" ||
    name === ".env" ||
    name === ".envrc" ||
    name.startsWith(".env.")
  );
}
