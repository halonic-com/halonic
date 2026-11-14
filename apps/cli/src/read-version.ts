// A loaded version of a workspace with the text of each file the load read,
// so a later question about a file (the placement check's, HAL-6477) is
// answered from the version a run read, not from the folder as it is now.

import type { DefinitionSource } from "@halonicjs/ports";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";

/** A version's load and the text of every file it read. */
export interface ReadVersion {
  readonly workspace: LoadedWorkspace;
  /** The file's text as the load read it, or `null` when the load didn't read it. */
  textOf(path: string): string | null;
}

/**
 * Loads the workspace from `source` and keeps the text of every file the
 * load reads.
 *
 * @throws what {@link loadWorkspace} throws
 */
export async function loadReadVersion(source: DefinitionSource): Promise<ReadVersion> {
  const texts = new Map<string, string>();
  const recording: DefinitionSource = {
    location: source.location,
    list: (dir) => source.list(dir),
    version: () => source.version(),
    read: async (path) => {
      const text = await source.read(path);
      if (text !== null) texts.set(path, text);
      return text;
    },
  };
  const workspace = await loadWorkspace(recording);
  return { workspace, textOf: (path) => texts.get(path) ?? null };
}
