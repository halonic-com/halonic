/**
 * `path` with the person's home folder written as `~`, or `path` as it is
 * when it is outside the home folder or the home folder is unknown. A folder
 * next to the home folder whose name starts the same stays as it is.
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
  if (path === root) return "~";
  const separator = path.charAt(root.length);
  if (path.startsWith(root) && (separator === "/" || separator === "\\")) {
    return `~${path.slice(root.length)}`;
  }
  return path;
}
