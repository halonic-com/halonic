import { posix } from "node:path";

/**
 * Whether `path` is absolute on `platform`, in the strict sense git and
 * Windows agree on. On Windows that is a drive letter followed by a slash
 * or a `\\server\share` path. `C:git`, with no slash after the
 * drive, and `\git` are not: Windows reads them against the current drive
 * or folder, which may be the workspace. Node's own `isAbsolute` accepts
 * `\git`, so the starters and `findProgram` share this check instead.
 */
export function isAbsolutePath(
  path: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (path === "") return false;
  if (platform === "win32") return /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/u.test(path);
  return posix.isAbsolute(path);
}
