import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * The tool folders of the working folder that Windows denies as a whole, and
 * makes empty when they are missing. srt on Windows denies by changing the
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
 * recognises a project, so an empty one is never made.
 */
const toolFoldersIfPresent: readonly string[] = [".idea"];

/** The parts of an existing `.git` that git runs or reads settings from; `.git` itself is never made. */
const gitPartsIfPresent: readonly string[] = [join(".git", "hooks"), join(".git", "config")];

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes each missing folder of `toolFoldersToCreate` in the working folder and
 * returns what the Windows session denies as folders, relative to it: those
 * folders, `.idea` when it exists, and `.git/hooks` and `.git/config` when
 * they exist. Root files (`.npmrc`, `.mcp.json`) get no placeholder: an empty
 * file would show in the person's `git status` and could break the tool that
 * reads it (HAL-11305).
 */
export async function prepareToolFolders(workingFolder: string): Promise<string[]> {
  for (const folder of toolFoldersToCreate) {
    await mkdir(join(workingFolder, folder), { recursive: true });
  }
  const present: string[] = [];
  for (const path of [...toolFoldersIfPresent, ...gitPartsIfPresent]) {
    if (await exists(join(workingFolder, path))) present.push(path);
  }
  return [...toolFoldersToCreate, ...present];
}
