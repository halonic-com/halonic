import {
  type SnapshotWriteBucket,
  writeDefinitionSnapshot,
} from "@halonicjs/adapter-cloudflare-storage";
import { placedRoutines } from "@halonicjs/app";
import type { DefinitionSource } from "@halonicjs/ports";
import { loadWorkspace } from "@halonicjs/workspace";

/** A read-only `DefinitionSource` over files held in memory. */
class FilesSource implements DefinitionSource {
  readonly location = "memory:snapshot";

  readonly #files: Readonly<Record<string, string>>;

  constructor(files: Readonly<Record<string, string>>) {
    this.#files = files;
  }

  async list(): Promise<string[]> {
    return Object.keys(this.#files).sort();
  }

  async read(path: string): Promise<string | null> {
    return this.#files[path] ?? null;
  }

  async version(): Promise<string> {
    return "v1";
  }
}

/**
 * Uploads a workspace as a snapshot, with the routine index built from the same
 * files: it loads the workspace (reading the YAML, here on the deployer's side)
 * and hands the files and their placed routines to `writeDefinitionSnapshot`, so
 * the index and the files can't disagree. Use this, not the low-level writer,
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
  return writeDefinitionSnapshot(bucket, files, placedRoutines(workspace));
}
