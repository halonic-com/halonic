// A path below a folder, written with the folder's own separator. The
// Studio's web view has no path module, so page-side code that only knows
// a folder (not the system it is on) joins names below it here.

/**
 * Whether a folder is written the Windows way: with a drive (`C:\`, `C:/`)
 * or with a `\` anywhere, as a network share (`\\server\share`) and a
 * drive-less `\agents\writer` are. macOS and Linux allow `\` in a name,
 * but no folder Halonic makes has one.
 */
function isWindowsFolder(folder: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(folder) || folder.includes("\\");
}

/**
 * Joins names below an absolute folder with the separator that folder's
 * system writes: `\` for a Windows folder, `/` for any other. Separators at
 * the folder's end are dropped, but a root such as `/` or `C:\` keeps its
 * own, so the result matches what `node:path` gives on that system.
 *
 * @param folder - an absolute folder
 * @param names - single folder or file names, none containing a separator
 * @returns the joined path
 *
 * @example
 * pathBelow("/srv/acme/", "settings", "home"); // "/srv/acme/settings/home"
 * pathBelow("D:/Acme", "settings"); // the same names, joined with `\`
 */
export function pathBelow(folder: string, ...names: readonly string[]): string {
  const windows = isWindowsFolder(folder);
  const separator = windows ? "\\" : "/";
  const trimmed = folder.replace(windows ? /[\\/]+$/u : /\/+$/u, "");
  const base = trimmed === "" || /^[A-Za-z]:$/u.test(trimmed) ? `${trimmed}${separator}` : trimmed;
  const glue = base.endsWith(separator) ? "" : separator;
  return names.length === 0 ? base : `${base}${glue}${names.join(separator)}`;
}
