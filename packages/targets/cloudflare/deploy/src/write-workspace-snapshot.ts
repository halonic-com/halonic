import {
  type IndexedHubs,
  type SnapshotWriteBucket,
  writeDefinitionSnapshot,
} from "@halonicjs/adapter-cloudflare-storage";
import { placedRoutines } from "@halonicjs/app";
import { type DefinitionSource, isPrivateWorkspacePath } from "@halonicjs/ports";
import { definitionsOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";

/**
 * A read-only `DefinitionSource` over files held in memory. Like the other
 * sources, it doesn't serve private files, so the indexes built from it hold
 * only what the snapshot holds.
 */
export class FilesSource implements DefinitionSource {
  readonly location = "memory:snapshot";

  readonly #files: Readonly<Record<string, string>>;

  constructor(files: Readonly<Record<string, string>>) {
    this.#files = files;
  }

  async list(): Promise<string[]> {
    return Object.keys(this.#files)
      .filter((path) => !isPrivateWorkspacePath(path))
      .sort();
  }

  async read(path: string): Promise<string | null> {
    if (isPrivateWorkspacePath(path)) {
      return null;
    }
    return this.#files[path] ?? null;
  }

  async version(): Promise<string> {
    return "v1";
  }
}

/**
 * Uploads a workspace as a snapshot, with the routine index and the
 * run-definitions index built from the same files: it loads the workspace
 * (reading the YAML, here on the deployer's side) and hands the files, their
 * placed routines and each hub's definitions to `writeDefinitionSnapshot`, so
 * the indexes and the files can't disagree. Use this, not the low-level writer,
 * wherever a deploy writes a snapshot.
 *
 * @returns the version that `current` now names
 * @throws RangeError for a path the port forbids, or a file at the index's own path
 */
export async function writeWorkspaceSnapshot(
  bucket: SnapshotWriteBucket,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const workspace = await loadWorkspace(new FilesSource(files));
  return writeDefinitionSnapshot(bucket, files, {
    routines: placedRoutines(workspace),
    runDefinitions: hubDefinitionsOf(workspace),
  });
}

/**
 * The definitions of every hub the workspace has a file in, by hub id: what a
 * run in that hub starts with, as `halonic serve` builds it from the same files.
 */
function hubDefinitionsOf(workspace: LoadedWorkspace): IndexedHubs {
  const hubIds = new Set<string>();
  for (const file of workspace.files) {
    if (file.hub !== null) {
      hubIds.add(file.hub);
    }
  }
  // `fromEntries` defines each key, so a hub named "__proto__" stays a hub.
  return Object.fromEntries(
    [...hubIds].sort().map((hubId) => [hubId, definitionsOf(workspace, hubId)]),
  );
}
