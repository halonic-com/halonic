import { randomBytes } from "node:crypto";
import { posix } from "node:path";

/** Runs a command as root in Halonic's WSL distro, with an argument list and no shell. */
export interface WslRoot {
  run(argv: readonly string[]): Promise<{ code: number; stdout: string }>;
}

/** The folder the one-off import mounts go under. */
export const IMPORT_MOUNTS_FOLDER = "/mnt/halonic-import";

const importMountName = /^import-[0-9a-f]{32}$/;

// A Windows drive path, so a mount can't be pointed at a share, a device or a relative path.
const drivePath = /^[A-Za-z]:\\/;

/**
 * Checks the Windows folder to mount: a drive letter and an absolute path
 * without `..`, a control character or a trailing separator.
 *
 * @throws when the path isn't one
 */
export function assertWindowsFolder(path: string): void {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this rejects
  const bad = !drivePath.test(path) || /[\u0000-\u001f]/.test(path) || /[\\/]$/.test(path.slice(3));
  if (bad || path.slice(3).split(/[\\/]/).includes(".."))
    throw new Error(`the folder ${JSON.stringify(path)} isn't an absolute Windows drive path`);
}

/** The options of the import mount: the source can be read and nothing more (W5). */
export const IMPORT_MOUNT_OPTIONS = "ro,noexec,nosuid,nodev,umask=077";

/**
 * The options of a project's mount on the Windows drive: owned by the
 * `halonic` user and closed to everyone else, with no set-id files or
 * devices (W5).
 */
export function driveMountOptions(uid: number, gid: number): string {
  if (!Number.isInteger(uid) || !Number.isInteger(gid) || uid < 0 || gid < 0)
    throw new Error("the uid and gid of the halonic user must be whole numbers");
  return `uid=${uid},gid=${gid},umask=077,nosuid,nodev`;
}

/** The command that mounts one Windows folder, and only it, at a mount point. */
export function mountCommand(windowsFolder: string, mountPoint: string, options: string): string[] {
  assertWindowsFolder(windowsFolder);
  return ["mount", "-t", "drvfs", windowsFolder, mountPoint, "-o", options];
}

/** A fresh mount point for one import: its name can't be guessed or reused. */
export function newImportMountPoint(): string {
  return posix.join(IMPORT_MOUNTS_FOLDER, `import-${randomBytes(16).toString("hex")}`);
}

async function mustRun(root: WslRoot, argv: readonly string[]): Promise<void> {
  const { code } = await root.run(argv);
  if (code !== 0) throw new Error(`${argv[0]} failed in the distro (exit ${code})`);
}

/**
 * Mounts a Windows folder read-only (`noexec,nosuid,nodev`) at a fresh random
 * mount point, runs `use` with it, and always unmounts and removes the mount
 * point afterwards, also when `use` throws (W5).
 *
 * The mount point is removed with `rmdir`, never recursively, so a mount that
 * stayed behind can't have its files deleted. A mount that can't be removed
 * is left for `cleanupImportMounts` at the next start; the error of `use`,
 * if there is one, wins over the one from the clean-up.
 */
export async function withImportMount<T>(
  root: WslRoot,
  windowsFolder: string,
  use: (mountPoint: string) => Promise<T>,
): Promise<T> {
  const mountPoint = newImportMountPoint();
  const command = mountCommand(windowsFolder, mountPoint, IMPORT_MOUNT_OPTIONS);
  await mustRun(root, ["mkdir", "-p", "-m", "700", "--", IMPORT_MOUNTS_FOLDER]);
  await mustRun(root, ["mkdir", "-m", "700", "--", mountPoint]);
  let result: T | undefined;
  let failure: { error: unknown } | undefined;
  try {
    await mustRun(root, command);
    result = await use(mountPoint);
  } catch (error) {
    failure = { error };
  }
  try {
    await mustRun(root, ["umount", "--", mountPoint]);
    await mustRun(root, ["rmdir", "--", mountPoint]);
  } catch (error) {
    failure ??= { error };
  }
  if (failure) throw failure.error;
  return result as T;
}

/**
 * Unmounts and removes the import mounts a crash left behind. Only names this
 * module makes are touched, and only with `umount` and `rmdir`.
 *
 * @returns the mount points that couldn't be removed
 */
export async function cleanupImportMounts(root: WslRoot): Promise<string[]> {
  const listing = await root.run(["ls", "-1A", "--", IMPORT_MOUNTS_FOLDER]);
  if (listing.code !== 0) return [];
  const stuck: string[] = [];
  for (const name of listing.stdout.split("\n")) {
    if (!importMountName.test(name)) continue;
    const mountPoint = posix.join(IMPORT_MOUNTS_FOLDER, name);
    await root.run(["umount", "--", mountPoint]); // not mounted is fine: rmdir tells
    const removed = await root.run(["rmdir", "--", mountPoint]);
    if (removed.code !== 0) stuck.push(mountPoint);
  }
  return stuck;
}
