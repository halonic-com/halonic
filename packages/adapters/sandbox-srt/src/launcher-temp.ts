import { chmod, mkdtemp } from "node:fs/promises";
import { join } from "node:path";

/** Where the launcher's temp folders go: short on every Unix, whoever the user is. */
const shortTempRoot = "/tmp";

/**
 * Makes the launcher's own temp folder, private to the current user. srt puts
 * its Unix sockets in the launcher's temp folder, and a socket path holds at
 * most 104 bytes on macOS (108 on Linux): under the session's temp folder,
 * which holds the user's name and the run id, it can be too long (HAL-5850).
 * On Windows srt uses a loopback port instead, so the launcher keeps the
 * session's temp folder there.
 *
 * @returns the folder, or null on Windows
 */
export async function makeLauncherTemp(
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  if (platform === "win32") return null;
  const folder = await mkdtemp(join(shortTempRoot, "hsrt-"));
  // mkdtemp asks for 0700, but the umask applies.
  await chmod(folder, 0o700);
  return folder;
}
