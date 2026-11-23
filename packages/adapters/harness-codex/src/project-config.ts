import { dirname, join } from "node:path";
import type { SettingsFolderWriter } from "@halonicjs/adapter-harness-kit";

/** Where a project keeps its own Codex settings, in a folder Codex reads them from. */
export const projectConfigPath = join(".codex", "config.toml");

/** What marks a project's root for Codex: the folder that holds `.git`. */
const projectRootMarker = ".git";

/**
 * Refuses to start Codex where a project's own `.codex/config.toml` would sit
 * next to Halonic's settings (requirement `harness-codex.pinned-settings`).
 * Codex looks for one in each folder from the working folder up to the
 * project's root, the nearest folder on the way that holds `.git`, or in the
 * working folder alone when no folder does. The working folder is the
 * workspace's or its run's proposal folder, so this covers the workspace's
 * root too. Halonic gives Codex every setting that matters itself, so a
 * project's file is never needed.
 *
 * @throws Error naming the file, when one of those folders holds it
 */
export async function refuseProjectConfig(
  workingFolder: string,
  disk: Pick<SettingsFolderWriter, "exists">,
): Promise<void> {
  for (const folder of await projectFolders(workingFolder, disk)) {
    const path = join(folder, projectConfigPath);
    if (await disk.exists(path)) {
      throw new Error(
        `Codex can't start here: ${path} holds Codex settings for the project, and Halonic gives Codex its settings itself. Remove the file, or move it out of the project.`,
      );
    }
  }
}

/** The folders from the working folder up to its project's root, or the working folder alone when it is in no project. */
async function projectFolders(
  workingFolder: string,
  disk: Pick<SettingsFolderWriter, "exists">,
): Promise<string[]> {
  const folders = [workingFolder];
  let folder = workingFolder;
  while (!(await disk.exists(join(folder, projectRootMarker)))) {
    const parent = dirname(folder);
    if (parent === folder) return [workingFolder];
    folders.push(parent);
    folder = parent;
  }
  return folders;
}
