import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Empty folders a pinned program starts in, one per launch, so it reads no
 * workspace's `.npmrc`, `node_modules`, `uv.toml` or `pyproject.toml`.
 */
export interface LaunchFolders {
  /** Creates a new empty folder and returns its path. */
  create(): Promise<string>;
  /** Deletes a folder `create` returned, with everything the program left in it. */
  remove(folder: string): Promise<void>;
}

/** Launch folders in the system's temporary folder, outside every workspace. */
export const nodeLaunchFolders: LaunchFolders = {
  create: () => mkdtemp(join(tmpdir(), "halonic-connector-")),
  remove: (folder) => rm(folder, { recursive: true, force: true, maxRetries: 3 }),
};
