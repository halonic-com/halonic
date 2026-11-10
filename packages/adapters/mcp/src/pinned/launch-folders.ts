import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Folders a pinned program starts in, one per launch, so it reads no
 * workspace's `.npmrc`, `node_modules`, `uv.toml` or `pyproject.toml`.
 */
export interface LaunchFolders {
  /** Creates a new launch folder, holding only {@link launchFolderFiles}, and returns its path. */
  create(): Promise<string>;
  /** Deletes a folder `create` returned, with everything the program left in it. */
  remove(folder: string): Promise<void>;
}

/** The empty npm config file in each launch folder. */
export const emptyNpmrc = "npmrc";

/**
 * The files a launch folder starts with. npm looks for a project upward
 * from the folder it starts in, so in an empty folder under a temporary
 * folder anyone can write to (`/tmp` on Linux), a planted `package.json`,
 * `node_modules` or `.npmrc` there would run instead of the download or
 * move the registry. A `package.json` makes the launch folder the project,
 * and {@link emptyNpmrc} is the empty file `pinnedEnv` points npm's user
 * and global config at.
 */
export const launchFolderFiles: Readonly<Record<string, string>> = {
  "package.json": "{}\n",
  [emptyNpmrc]: "",
};

/** Launch folders in the system's temporary folder, outside every workspace. */
export const nodeLaunchFolders: LaunchFolders = {
  create: async () => {
    const folder = await mkdtemp(join(tmpdir(), "halonic-connector-"));
    try {
      for (const [name, text] of Object.entries(launchFolderFiles)) {
        await writeFile(join(folder, name), text, { flag: "wx" });
      }
    } catch (cause) {
      await removeFolder(folder);
      throw cause;
    }
    return folder;
  },
  remove: (folder) => removeFolder(folder),
};

function removeFolder(folder: string): Promise<void> {
  return rm(folder, { recursive: true, force: true, maxRetries: 3 });
}
