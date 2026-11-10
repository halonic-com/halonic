import { isAbsolute, relative, sep } from "node:path";

/**
 * A folder as the user would type it from where they are (cli-output 1.2):
 * `./schemas` for a folder below, `../out` for one above, and the full path
 * when it's on another drive. The separator is the system's, so `.\schemas`
 * on Windows.
 */
export function shownPath(cwd: string, target: string): string {
  const path = relative(cwd, target);
  if (path === "") {
    return ".";
  }
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) {
    return path;
  }
  return `.${sep}${path}`;
}
