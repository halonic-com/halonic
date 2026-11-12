// The harness agents' working folders as a local connector's starter needs
// them (stack 4h of the HAL-189 plan, Julian's condition on HAL-4739): real
// absolute paths, so a program that runs or loads a file an agent could
// have written is refused before it starts (`format.working-folder-start`).

import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { harnessWorkingFolders, type LoadedWorkspace } from "@halonicjs/workspace";

/**
 * The working folder of every harness agent in `workspace`, as real
 * absolute paths under the workspace's real path: through symbolic links
 * and Windows short names. A folder that doesn't exist yet is given under
 * the real workspace path; the connector's check follows it as far as it
 * exists.
 *
 * @param root - the workspace folder, as `openWorkspaceDir` found it
 * @throws when the workspace folder doesn't exist
 *
 * @example
 * await realWorkingFolders(dir.root, workspace); // ["<real root>/files/agents/coder"]
 */
export async function realWorkingFolders(
  root: string,
  workspace: LoadedWorkspace,
): Promise<string[]> {
  const realRoot = await realpath(root);
  return Promise.all(
    harnessWorkingFolders(workspace).map(async (folder) => {
      const path = join(realRoot, folder);
      return realpath(path).catch(() => path);
    }),
  );
}

/**
 * The working folders a program that starts in `folder` must not start
 * from: the harness agents' folders under `folder`, and under the real
 * workspace too. A live run's programs start in a copy, but an agent writes
 * in the real workspace, so a start that names a file there is refused as it
 * is from the saved files (security review on HAL-7172).
 *
 * @param folder - where the program starts: the workspace, or a copy of it
 * @param root - the workspace folder
 * @throws when either folder doesn't exist
 *
 * @example
 * await programWorkingFolders(copy, dir.root, workspace);
 * // ["<real copy>/files/agents/coder", "<real root>/files/agents/coder"]
 */
export async function programWorkingFolders(
  folder: string,
  root: string,
  workspace: LoadedWorkspace,
): Promise<string[]> {
  const [inFolder, inWorkspace] = await Promise.all([
    realWorkingFolders(folder, workspace),
    realWorkingFolders(root, workspace),
  ]);
  // A saved-files run starts in the workspace itself: name each folder once.
  return [...new Set([...inFolder, ...inWorkspace])];
}
