import { posix } from "node:path";

/** One fixed step of the image's runtime updater (`halonic-runtime`) for an import. */
export type ImportStep = readonly ["import-mount"] | readonly ["import-unmount", string];

/**
 * Runs commands in Halonic's WSL distro, with an argument list and no shell.
 * Everything runs as the `halonic` user; the only things that run as root
 * are the updater's fixed import steps, which mount and unmount and nothing
 * more, so root never acts by path in a folder `halonic` can change (W2b).
 */
export interface WslDistro {
  /** Runs a command as the `halonic` user. */
  run(argv: readonly string[]): Promise<{ code: number; stdout: string }>;
  /** Runs one import step of `halonic-runtime` as root, with `input` on its standard input (W7). */
  runtime(step: ImportStep, input?: string): Promise<{ code: number; stdout: string }>;
}

/**
 * The folder the one-off import mounts go under: the one the Windows-drive
 * projects use, which every session denies as a whole (W1, W5).
 */
export const IMPORT_MOUNTS_FOLDER = "/mnt/halonic";

const importMountName = /^import-[0-9a-f]{32}$/;

// A Windows drive path, so a mount can't be pointed at a share, a device or a relative path.
const drivePath = /^[A-Za-z]:\\/;

/**
 * Checks the Windows folder to mount: a drive letter and an absolute path
 * with at least one folder, and no empty, `.` or `..` segment and no control
 * character. A whole drive is refused.
 *
 * @throws when the path isn't one
 */
export function assertWindowsFolder(path: string): void {
  // A drive root has no segment, so it comes out as one empty segment and is refused too.
  const segments = path.slice(3).split(/[\\/]/);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this rejects
  const bad = !drivePath.test(path) || /[\u0000-\u001f\u007f]/.test(path);
  if (bad || segments.some((segment) => segment === "" || segment === "." || segment === ".."))
    throw new Error(`the folder ${JSON.stringify(path)} isn't an absolute Windows drive path`);
}

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

/**
 * Mounts a Windows folder for an import, runs `use` with the mount point, and
 * always unmounts it afterwards, also when `use` throws (W5). The updater's
 * `import-mount` step reads the folder on standard input, never from the
 * command line (W7), and mounts it read-only (`noexec,nosuid,nodev`) for the
 * `halonic` user, closed to everyone else, at a fresh random mount point.
 *
 * A mount that can't be removed is left for the updater's
 * `cleanup-import-mounts` step at the next start; the error of `use`, if
 * there is one, wins over the one from the clean-up.
 *
 * @throws when the folder isn't an absolute Windows drive path, the mount fails, `use` throws or the unmount fails
 */
export async function withImportMount<T>(
  distro: WslDistro,
  windowsFolder: string,
  use: (mountPoint: string) => Promise<T>,
): Promise<T> {
  assertWindowsFolder(windowsFolder);
  const mounted = await distro.runtime(["import-mount"], `${windowsFolder}\n`);
  if (mounted.code !== 0)
    throw new Error(`import-mount failed in the distro (exit ${mounted.code})`);
  const mountPoint = mounted.stdout.trim();
  const name = posix.basename(mountPoint);
  if (posix.join(IMPORT_MOUNTS_FOLDER, name) !== mountPoint || !importMountName.test(name))
    throw new Error(
      `import-mount printed ${JSON.stringify(mountPoint)}, not an import mount point`,
    );
  let result: T | undefined;
  let failure: { error: unknown } | undefined;
  try {
    result = await use(mountPoint);
  } catch (error) {
    failure = { error };
  }
  const unmounted = await distro.runtime(["import-unmount", name]);
  if (unmounted.code !== 0)
    failure ??= {
      error: new Error(`import-unmount failed in the distro (exit ${unmounted.code})`),
    };
  if (failure) throw failure.error;
  return result as T;
}
