import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * The most `..` a shown path climbs: past that, "../../../../tmp/x" is
 * harder to read than the full path (HAL-12126).
 */
const mostLevelsUp = 2;

/**
 * A folder as the user would type it from where they are (cli-output 1.2):
 * `./schemas` for a folder below, `../out` for one above, and the full path
 * when it's on another drive or more than two folders up. The separator is
 * the system's, so `.\schemas` on Windows.
 */
export function shownPath(cwd: string, target: string): string {
  const path = typedPath(cwd, target);
  if (path === "") {
    return ".";
  }
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) {
    return path;
  }
  return `.${sep}${path}`;
}

/**
 * A folder as a command such as `cd` takes it: relative to `cwd` without the
 * `./`, or the full path when it's on another drive or more than two folders
 * up. `""` is `cwd` itself.
 *
 * @example
 * typedPath("work", "work/acme"); // "acme"
 * typedPath("work/a/b/c", "acme"); // the full path of acme
 */
export function typedPath(cwd: string, target: string): string {
  const path = relative(cwd, target);
  if (isAbsolute(path)) {
    return path;
  }
  const levelsUp = path.split(sep).filter((part) => part === "..").length;
  return levelsUp > mostLevelsUp ? resolve(cwd, target) : path;
}
