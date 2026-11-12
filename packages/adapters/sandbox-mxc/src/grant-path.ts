// How the adapter writes the paths it hands MXC, following the grant rules
// from HAL-3503 (docs/adr/2026-11-10-mxc-sandbox-backend.md, "How the adapter
// runs a program"): grants name folders, never single files; every path is a
// plain absolute Windows path; and the drive root is never granted.

import { win32 } from "node:path";

/** What the adapter asks the disk about a path it is about to grant. */
export interface GrantDisk {
  /** Whether `path` is a folder, a file, or not there at all. */
  kind(path: string): Promise<"folder" | "file" | "missing">;
}

/** A path starting with a drive letter, such as `C:\` or `c:/`. */
const startsWithDrive = /^[A-Za-z]:\\/;

/** A drive root once the trailing backslash is gone, such as `C:`. */
const isDriveRoot = /^[A-Z]:$/;

/**
 * A path in the one form the adapter hands MXC (rule 2): absolute, with a
 * drive letter in capitals, backslashes only, `.` and `..` resolved, and no
 * trailing backslash. Every form worked on Windows 11 in HAL-3503; one form
 * keeps logs and tests simple.
 *
 * @example
 * grantPath("c:/acme/project/"); // "C:\\acme\\project" (leak-guard: allow absolute-path made-up example path)
 *
 * @throws when the path has no drive letter, such as a relative path or a `\\server\share` path
 * @throws when the path is a drive root (rule 4): granting it opens every file name on the drive
 */
export function grantPath(path: string): string {
  const withBackslashes = path.replaceAll("/", "\\");
  if (!startsWithDrive.test(withBackslashes)) {
    throw new Error(
      `MXC needs an absolute Windows path with a drive letter, and "${path}" isn't one.`,
    );
  }
  const normal = win32.normalize(withBackslashes).replace(/\\+$/, "");
  const plain = normal.charAt(0).toUpperCase() + normal.slice(1);
  if (isDriveRoot.test(plain)) {
    throw new Error(`MXC never grants a drive root, and "${path}" is one.`);
  }
  return plain;
}

/**
 * The read-only folders to grant for a profile's `readOnlyPaths` (rule 1):
 * each one in {@link grantPath} form, without duplicates, and without paths
 * that aren't there, since there is nothing to read. MXC refuses a read-only
 * grant on a single file, so a file is refused here with a sentence that
 * names it, and never widened to the folder it is in: that would let the
 * program read the file's neighbours too.
 *
 * @example
 * await readOnlyFolders(["C:/acme/tools/", "C:\\acme\\tools"], disk); // ["C:\\acme\\tools"] (leak-guard: allow absolute-path made-up example path)
 *
 * @throws when a path is a file, or isn't a path {@link grantPath} takes
 */
export async function readOnlyFolders(
  paths: readonly string[],
  disk: GrantDisk,
): Promise<string[]> {
  const folders: string[] = [];
  for (const path of paths) {
    const grant = grantPath(path);
    if (folders.includes(grant)) continue;
    const kind = await disk.kind(grant);
    if (kind === "missing") continue;
    if (kind === "file") {
      throw new Error(
        `MXC grants only folders, and the read-only path "${grant}" is a file. Copy it into a folder the box owns; the adapter never grants the folder around it instead.`,
      );
    }
    folders.push(grant);
  }
  return folders;
}

/**
 * The denied paths in {@link grantPath} form, without duplicates. Unlike
 * grants, these may name single files: a denied file inside a readable
 * folder stayed hidden on Windows 11 (HAL-3503).
 *
 * @throws when a path isn't one {@link grantPath} takes
 */
export function deniedGrantPaths(paths: readonly string[]): string[] {
  return [...new Set(paths.map(grantPath))];
}
