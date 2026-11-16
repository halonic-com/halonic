import { win32 } from "node:path";

/** `a` is `b`, or lies inside it, as Windows reads paths (without regard to case). */
function insideOrSame(parent: string, child: string): boolean {
  const base = parent.toLowerCase();
  const path = child.toLowerCase();
  return path === base || path.startsWith(base.endsWith("\\") ? base : `${base}\\`);
}

/**
 * The folders of the host's `PATH` the program may read but not change on
 * Windows: the harness's tools (Node, Git, a package manager) that live in
 * the user profile `home`, where srt's install without the profile grant
 * keeps the sandbox account out (HAL-5398, S1).
 *
 * A folder counts only when it is a full path with a drive letter that lies
 * strictly below `home`, and is not:
 * - `AppData`, or its `Roaming` or `Local` as a whole (only a folder inside
 *   them), as that would open every program's data;
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
  const whole = [appData, win32.join(appData, "Roaming"), win32.join(appData, "Local")];
  const refused = [...denied, ...writable].map((path) => win32.resolve(path));
  const found = new Map<string, string>();
  for (const entry of (hostPath ?? "").split(";")) {
    const raw = entry.trim().replace(/^"(.*)"$/, "$1");
    if (!/^[a-z]:[\\/]/i.test(raw)) continue;
    const folder = win32.resolve(raw);
    if (!insideOrSame(root, folder) || folder.toLowerCase() === root.toLowerCase()) continue;
    if (whole.some((path) => path.toLowerCase() === folder.toLowerCase())) continue;
    if (refused.some((path) => insideOrSame(path, folder) || insideOrSame(folder, path))) continue;
    if (!found.has(folder.toLowerCase())) found.set(folder.toLowerCase(), folder);
  }
  return [...found.values()];
}
