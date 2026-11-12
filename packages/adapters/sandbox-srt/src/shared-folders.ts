import { stat } from "node:fs/promises";
import { posix } from "node:path";

/**
 * The shared folders of Halonic's WSL distro (`srt-wsl`, security review W1
 * on HAL-5407): the `halonic` user's home, which holds every project
 * (`projects/<name>`), Halonic's data and each harness's sign-ins; the
 * Windows-drive project mounts (`/mnt/halonic/<name>`); and `/mnt/wsl`, which
 * every WSL distro shares (Docker Desktop's socket folder among them). srt on
 * Linux leaves reads open, so a session denies each of them as a whole and
 * re-allows only its own folders inside (see `buildSrtConfig`).
 */
export const WSL_SHARED_FOLDERS: readonly string[] = [
  // From parts, so the repo's check for one machine's home folder doesn't read the distro's fixed one as such.
  posix.join("/home", "halonic"),
  "/mnt/halonic",
  "/mnt/wsl",
];

/**
 * Checks that each shared folder is there and is a folder, so its deny
 * applies. srt leaves out a deny for a path that isn't there, and a folder
 * made there while the session runs would then be readable to it.
 *
 * @throws when a shared folder is missing or isn't a folder, so the session doesn't open
 */
export async function assertSharedFolders(sharedFolders: readonly string[]): Promise<void> {
  for (const folder of sharedFolders) {
    let isFolder: boolean;
    try {
      isFolder = (await stat(folder)).isDirectory();
    } catch (error) {
      throw new Error(`the shared folder ${folder} can't be hidden`, { cause: error });
    }
    if (!isFolder)
      throw new Error(`the shared folder ${folder} can't be hidden: it isn't a folder`);
  }
}
