import { win32 } from "node:path";
import { insideOrSame, pathsOverlap } from "@halonicjs/adapter-system-node";

/**
 * The folders of the host's `PATH` the program may read but not change on
 * Windows: the harness's tools (Node, Git, a package manager) that live in
 * the user profile `home`, where srt's install without the profile grant
 * keeps the sandbox account out (HAL-5398, S1).
 *
 * A folder counts only when it is a full path with a drive letter that lies
 * strictly below `home`, and is not:
 * - `AppData` or anything inside it: it holds every program's data, and a
 *   read grant on `AppData\Local\Microsoft\WindowsApps` made the fence
 *   probe fail with `EPERM` on `AppData\Local` on the Windows runner;
 * - on, above or inside a path in `denied` (srt lets a read allowance win
 *   over a denial, so a folder inside one would reopen it);
 * - on, above or inside a folder the program writes, in `writable`.
 *
 * Relative entries, `C:folder` forms and UNC names are dropped. The folders
 * come back once each, as `win32.resolve` writes them.
 */
export function toolFoldersInProfile(
  hostPath: string | undefined,
  home: string,
  denied: readonly string[],
  writable: readonly string[],
): string[] {
  const root = win32.resolve(home);
  const appData = win32.join(root, "AppData");
  const refused = [...denied, ...writable];
  const found = new Map<string, string>();
  for (const entry of (hostPath ?? "").split(";")) {
    const raw = entry.trim().replace(/^"(.*)"$/, "$1");
    if (!/^[a-z]:[\\/]/i.test(raw)) continue;
    const folder = win32.resolve(raw);
    if (!insideOrSame(root, folder) || folder.toLowerCase() === root.toLowerCase()) continue;
    if (insideOrSame(appData, folder)) continue;
    if (refused.some((path) => pathsOverlap(path, folder))) continue;
    if (!found.has(folder.toLowerCase())) found.set(folder.toLowerCase(), folder);
  }
  return [...found.values()];
}

/**
 * The `folders` that are not on, above or inside any of the `refused` paths.
 * srt lets a read allowance win over a denial, so a tool folder above or
 * inside a hidden folder would reopen it. Windows spelling and case are
 * ignored, and `refused` should hold every spelling of each path (as given
 * and link-resolved).
 */
export function clearOfPaths(folders: readonly string[], refused: readonly string[]): string[] {
  return folders.filter((folder) => !refused.some((path) => pathsOverlap(path, folder)));
}
