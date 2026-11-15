import { realpath } from "node:fs/promises";

/**
 * The real path of `folder` when it is one of the folders the launcher named
 * as workspaces (compared by real path, so a link or `..` can't pass for one);
 * `undefined` for any other folder, or one that doesn't exist.
 */
export async function namedWorkspace(
  workspaceRoots: readonly string[],
  folder: string,
): Promise<string | undefined> {
  const real = await realpath(folder).catch(() => undefined);
  if (real === undefined) return undefined;
  const named = await Promise.all(workspaceRoots.map((root) => realpath(root).catch(() => root)));
  return named.includes(real) ? real : undefined;
}
