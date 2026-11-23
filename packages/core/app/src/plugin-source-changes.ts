// What changed between two copies of a plugin's files, and between an added
// plugin's copy and the folder it was copied from (HAL-16319): `plugin add
// --update` names the files it changed, and `plugin list` says when the
// folder changed since the copy, so editing it isn't silently ignored.

import type { Digest, FolderReader } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { type PluginProblem, readPluginFolder } from "./plugin-folder.ts";
import { readFailedProblem } from "./plugin-service-problems.ts";
import { PluginSourceSnapshot, sourceFolder } from "./plugin-source.ts";
import { fileChanges, type PluginFileChanges } from "./plugin-trust-changes.ts";
import type { PluginFileHash } from "./plugin-trust-content.ts";

/**
 * The files added, changed and removed from `before` to `after`, by path,
 * each list sorted.
 *
 * @example
 * pluginFileChanges(install.files, updated.files).changed; // ["backend/index.js"]
 */
export function pluginFileChanges(
  before: readonly PluginFileHash[],
  after: readonly PluginFileHash[],
): PluginFileChanges {
  return fileChanges(before, after);
}

/**
 * What changed in the folder `source` since `copied`, the files an install
 * record holds, read as `PluginService.add` reads a source: private names
 * and paths the sandbox denies are left out, so they never count as a
 * change. A source that can't be read or checked now gives its problems.
 *
 * @example
 * const changes = await pluginSourceFileChanges(new FileSystemFolderReader(path), digest, install.files);
 * if (changes.ok && changes.value.changed.length > 0) sayItChanged();
 */
export async function pluginSourceFileChanges(
  source: FolderReader,
  digest: Digest,
  copied: readonly PluginFileHash[],
): Promise<Result<PluginFileChanges, readonly PluginProblem[]>> {
  let read: Awaited<ReturnType<typeof readPluginFolder>>;
  try {
    read = await readPluginFolder(new PluginSourceSnapshot(source), digest, sourceFolder, {
      namedById: false,
    });
  } catch (error) {
    return err([readFailedProblem(error)]);
  }
  if (!read.ok) return err(read.error);
  return ok(fileChanges(copied, read.value.files));
}
