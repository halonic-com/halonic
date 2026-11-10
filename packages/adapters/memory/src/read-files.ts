import type { DefinitionStore } from "@halonicjs/ports";
import type { Tree } from "./vcs-repository.ts";

/** Each path's text in `files`, or `null` where there is no such file. */
export async function readAll(
  files: DefinitionStore,
  paths: readonly string[],
): Promise<Map<string, string | null>> {
  const contents = new Map<string, string | null>();
  for (const path of paths) contents.set(path, await files.read(path));
  return contents;
}

/** Every file in `files` as it is now; `list()` already leaves out private entries. */
export async function readTree(files: DefinitionStore): Promise<Tree> {
  const tree = new Map<string, string>();
  for (const path of await files.list()) tree.set(path, await readListed(files, path));
  return tree;
}

/** The text of a file that was just listed; throws when another writer removed it meanwhile. */
export async function readListed(files: DefinitionStore, path: string): Promise<string> {
  const content = await files.read(path);
  if (content === null) throw new Error(`${path} was removed while it was being read.`);
  return content;
}
