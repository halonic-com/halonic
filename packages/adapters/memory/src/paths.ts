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
