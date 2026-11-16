/**
 * `path` with the person's home folder written as `~`, or `path` as it is
 * when it is outside the home folder or the home folder is unknown. A folder
 * next to the home folder whose name starts the same stays as it is. A
 * Windows home folder (one that starts with a drive letter) is matched
 * whatever the letter case, as Windows does, so a path that went through a
 * canonical-case step is shortened too.
 *
 * @param path - an absolute path
 * @param home - the person's home folder, or `null` when it is unknown
 * @returns the path to log
 *
 * @example
 * shortenHome("<home>/work", "<home>"); // => "~/work"
 */
export function shortenHome(path: string, home: string | null): string {
  if (home === null) return path;
  const root = home.replace(/[/\\]+$/, "");
  if (root === "") return path;
  const foldCase = isWindowsPath(root)
    ? (text: string) => text.toLowerCase()
    : (text: string) => text;
  if (foldCase(path) === foldCase(root)) return "~";
  const separator = path.charAt(root.length);
  if (
    foldCase(path.slice(0, root.length)) === foldCase(root) &&
    (separator === "/" || separator === "\\")
  ) {
    return `~${path.slice(root.length)}`;
  }
  return path;
}

/** Whether `path` starts with a drive letter, such as `C:\`, so it is on Windows, where names ignore case. */
function isWindowsPath(path: string): boolean {
  return /^[a-z]:[/\\]/i.test(path);
}
