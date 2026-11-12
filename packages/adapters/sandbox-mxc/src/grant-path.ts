// How the adapter writes the paths it hands MXC, following the grant rules
// from HAL-3503 (docs/adr/2026-11-10-mxc-sandbox-backend.md, "How the adapter
// runs a program"): grants name folders, never single files (HAL-7841 copies a
// read-only file into a folder the box owns); every path is a
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
 * A path part Windows reads as another name: Win32 drops a part's trailing
 * dots and spaces, so `...` names the folder above and `acme. ` names `acme`.
 */
const endsInDotOrSpace = /[. ]$/;

/**
 * A path in the one form the adapter hands MXC (rule 2): absolute, with a
 * drive letter in capitals, backslashes only, `.` and `..` resolved, and no
 * trailing backslash. Every form worked on Windows 11 in HAL-3503; one form
 * keeps logs and tests simple.
 *
 * A path that Windows would read as a different one is refused, not
 * repaired: MXC only ever gets a path that names what it says.
 *
 * @example
 * grantPath("c:/acme/project/"); // "C:\\acme\\project" (leak-guard: allow absolute-path made-up example path)
 *
 * @throws when the path has no drive letter, such as a relative path or a `\\server\share` path
 * @throws when a part ends in a dot or a space, or a `:` follows the drive letter (an alternate stream such as `::$DATA`)
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
  refuseWhatWindowsRenames(normal, path);
  const plain = normal.charAt(0).toUpperCase() + normal.slice(1);
  if (isDriveRoot.test(plain)) {
    throw new Error(`MXC never grants a drive root, and "${path}" is one.`);
  }
  return plain;
}

/**
 * Refuses a normalized path that Windows would resolve to another path.
 * `win32.normalize` treats `...` and ` ` as ordinary names, so without this
 * `C:\acme\..\...` would pass as `C:\...`, which Windows reads as `C:\`. (leak-guard: allow absolute-path made-up example path)
 */
function refuseWhatWindowsRenames(normal: string, path: string): void {
  const [, ...parts] = normal.split("\\");
  if (parts.some((part) => endsInDotOrSpace.test(part))) {
    throw new Error(
      `MXC gets only paths Windows reads as written, and a part of "${path}" ends in a dot or a space, which Windows drops.`,
    );
  }
  if (parts.some((part) => part.includes(":"))) {
    throw new Error(
      `MXC gets only paths Windows reads as written, and "${path}" has a ":" after the drive letter, which names a stream inside a file.`,
    );
  }
}

/** What a profile's `readOnlyPaths` come to: folders MXC can grant, and files it can't. */
export interface ReadOnlyGrants {
  /** Folders to grant read-only, in {@link grantPath} form, without duplicates. */
  folders: string[];
  /** Single files, in {@link grantPath} form, without duplicates. MXC grants only folders, so the session copies them into a folder it owns. */
  files: string[];
}

/**
 * Sorts a profile's `readOnlyPaths` into folders to grant (rule 1) and files
 * to copy, each in {@link grantPath} form and without duplicates. Paths that
 * aren't there are left out, since there is nothing to read. MXC refuses a
 * read-only grant on a single file, and the folder around a file is never
 * granted instead: that would let the program read the file's neighbours too.
 *
 * @example
 * await readOnlyGrants(["C:/acme/tools/", "C:\\acme\\tools\\a.json"], disk); // { folders: ["C:\\acme\\tools"], files: ["C:\\acme\\tools\\a.json"] } (leak-guard: allow absolute-path made-up example path)
 *
 * @throws when a path isn't one {@link grantPath} takes
 */
export async function readOnlyGrants(
  paths: readonly string[],
  disk: GrantDisk,
): Promise<ReadOnlyGrants> {
  const grants: ReadOnlyGrants = { folders: [], files: [] };
  for (const path of paths) {
    const grant = grantPath(path);
    if (grants.folders.includes(grant) || grants.files.includes(grant)) continue;
    const kind = await disk.kind(grant);
    if (kind === "folder") grants.folders.push(grant);
    if (kind === "file") grants.files.push(grant);
  }
  return grants;
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
