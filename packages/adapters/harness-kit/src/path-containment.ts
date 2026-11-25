// Whether one absolute path is, or is inside, another, under a machine's
// own path rules. The desktop passes `node:path`, which on Windows ignores
// case and accepts both separators; the Worker passes POSIX rules for its
// container. Both run the same tests (`path-containment.test.ts`).

import type { HostPaths } from "./host-paths.ts";

/**
 * Whether `path` is `folder` or lies inside it, under `paths`. A path that
 * only shares a prefix, such as `/a/bc` against `/a/b`, isn't inside.
 *
 * @example
 * isInsideOrSameOn(posixPath, "/workspace/hubs", "/workspace"); // true
 */
export function isInsideOrSameOn(paths: HostPaths, path: string, folder: string): boolean {
  const way = paths.relative(folder, path);
  return (
    way === "" || (!paths.isAbsolute(way) && way !== ".." && !way.startsWith(`..${paths.sep}`))
  );
}

/**
 * Whether `path` is inside `folder` and isn't `folder` itself, under `paths`.
 *
 * @example
 * isStrictlyInsideOn(posixPath, "/workspace", "/workspace"); // false
 */
export function isStrictlyInsideOn(paths: HostPaths, path: string, folder: string): boolean {
  return isInsideOrSameOn(paths, path, folder) && paths.relative(folder, path) !== "";
}

/**
 * Whether one of two absolute paths is, or is inside, the other, under `paths`.
 *
 * @example
 * overlapsOn(posixPath, "/workspace", "/workspace/hubs"); // true
 */
export function overlapsOn(paths: HostPaths, a: string, b: string): boolean {
  return isInsideOrSameOn(paths, a, b) || isInsideOrSameOn(paths, b, a);
}
