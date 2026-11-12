import { chmod, lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** Where the launcher's temp folders go: short on every Unix, whoever the user is. */
const shortTempRoot = "/tmp";

/** A launcher temp folder's name: `hsrt-<pid of the host that made it>-<random>`. */
const launcherTempName = /^hsrt-(\d+)-[^-]+$/;

/**
 * Makes the launcher's own temp folder, private to the current user. srt puts
 * its Unix sockets in the launcher's temp folder, and a socket path holds at
 * most 104 bytes on macOS (108 on Linux): under the session's temp folder,
 * which holds the user's name and the run id, it can be too long (HAL-5850).
 * On Windows srt uses a loopback port instead, so the launcher keeps the
 * session's temp folder there.
 *
 * The name holds the host's process id. The folder isn't in the journal, so
 * first this removes the ones a host that is gone left behind (HAL-6214).
 *
 * @returns the folder, or null on Windows
 */
export async function makeLauncherTemp(
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  if (platform === "win32") return null;
  await removeStaleLauncherTemps();
  const folder = await mkdtemp(join(shortTempRoot, `hsrt-${process.pid}-`));
  // mkdtemp asks for 0700, but the umask applies.
  await chmod(folder, 0o700);
  return folder;
}

/**
 * Removes the launcher temp folders of this user whose host process is gone:
 * a host that crashed never closed its sessions. A folder of a host that still
 * runs, this one included, stays. Never throws: a folder it can't look at or
 * remove stays for the next try.
 *
 * @param isRunning whether a process id is in use; a test passes its own
 */
export async function removeStaleLauncherTemps(
  root: string = shortTempRoot,
  isRunning: (pid: number) => boolean = processRuns,
): Promise<void> {
  const uid = process.getuid?.();
  if (uid === undefined) return;
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return;
  }
  for (const name of names) {
    const pid = launcherTempName.exec(name)?.[1];
    if (pid === undefined || isRunning(Number(pid))) continue;
    const folder = join(root, name);
    try {
      const stats = await lstat(folder);
      if (!stats.isDirectory() || stats.uid !== uid) continue;
      await rm(folder, { recursive: true, force: true });
    } catch {
      // Gone already, or not ours to remove.
    }
  }
}

/** Whether `pid` is in use. A process of another user (`EPERM`) runs too. */
function processRuns(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
