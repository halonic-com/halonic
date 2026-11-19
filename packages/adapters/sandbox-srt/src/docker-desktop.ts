// Whether Docker Desktop shows in Halonic's WSL distro (W6 of HAL-5407,
// HAL-12445): read from the file system, with no program started.

import { lstat, readdir } from "node:fs/promises";

/** Where Docker's socket is when Docker Desktop's WSL integration is on. */
export const dockerSocket = "/var/run/docker.sock";
/** The folder every WSL 2 distro shares, where Docker Desktop mounts its own. */
export const sharedWslFolder = "/mnt/wsl";

/**
 * Whether `socket` exists, as any kind of entry, or `shared` has an entry
 * whose name starts with `docker-desktop`. `lstat` and `readdir` don't follow
 * links. A missing `shared` is no Docker Desktop; one that can't be read
 * otherwise counts as Docker Desktop.
 */
export async function dockerDesktopShows(socket: string, shared: string): Promise<boolean> {
  try {
    await lstat(socket);
    return true;
  } catch {
    // No socket: look at the shared folder.
  }
  let names: string[];
  try {
    names = await readdir(shared);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
  return names.some((name) => name.startsWith("docker-desktop"));
}
