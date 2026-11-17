import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * The tool folders of the working folder that Windows denies as a whole, and
 * makes empty when nothing is there. srt on Windows denies by changing the
 * access on an existing file or folder, so a file that isn't there yet can't
 * be denied, but a folder deny covers what is made inside it later. An empty
 * folder is not shown by `git status` and no tool reads settings from it.
 */
export const toolFoldersToCreate: readonly string[] = [
  ".claude",
  ".codex",
  ".cursor",
  ".vscode",
  ".zed",
  ".devcontainer",
  ".husky",
  ".config",
];

/**
 * Tool folders that are denied only when they exist: `.idea` is how JetBrains
 * recognises a project, so an empty one is never made. `.git/hooks` and
 * `.git/config` come from `gitPathsToDeny`, so they aren't listed here.
 */
const toolFoldersIfPresent: readonly string[] = [".idea"];

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes each folder of `toolFoldersToCreate` that has nothing at its path in
 * the working folder and returns what the Windows session denies, relative to
 * it: those names and `.idea` when it exists. Something that is already there
 * under one of the names, even a file, is denied as it is; making a folder
 * over it would fail and the session wouldn't open. Root files (`.npmrc`,
 * `.mcp.json`) get no placeholder, so they are not covered on Windows
 * (HAL-11305): an empty file made at the start would show in the person's
 * `git status` and could break the tool that reads it.
 */
export async function prepareToolFolders(workingFolder: string): Promise<string[]> {
  for (const folder of toolFoldersToCreate) {
    const path = join(workingFolder, folder);
    if (!(await exists(path))) await mkdir(path, { recursive: true });
  }
  const present: string[] = [];
  for (const folder of toolFoldersIfPresent) {
    if (await exists(join(workingFolder, folder))) present.push(folder);
  }
  return [...toolFoldersToCreate, ...present];
}
