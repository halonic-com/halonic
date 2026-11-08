// Forward-slash paths, the way workspace files are named on every platform.
// The functions behave like node:path.posix, which the core can't import.

/**
 * Cleans up a path: joins repeated slashes, drops `.` segments and resolves
 * `..` against the segment before it. A leading `/` and a trailing `/` are
 * kept. An empty path becomes `.`.
 *
 * It doesn't check that a path stays inside a folder: `normalize("../a")`
 * is `"../a"`. Callers that accept paths from people must refuse a leading
 * `..` themselves.
 *
 * @param path - the path to clean
 * @returns the clean path
 *
 * @example
 * posixPath.normalize("hubs//support/./agents/../skills/"); // "hubs/support/skills/"
 */
function normalize(path: string): string {
  if (path === "") {
    return ".";
  }
  const absolute = path.startsWith("/");
  const trailingSlash = path.endsWith("/");
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    const previous = segments.at(-1);
    if (segment === ".." && previous !== undefined && previous !== "..") {
      segments.pop();
    } else if (segment === ".." && absolute) {
      // Nothing is above the root.
    } else {
      segments.push(segment);
    }
  }
  if (segments.length === 0) {
    if (absolute) {
      return "/";
    }
    return trailingSlash ? "./" : ".";
  }
  const normalized = segments.join("/") + (trailingSlash ? "/" : "");
  return absolute ? `/${normalized}` : normalized;
}

/**
 * Joins path segments with `/` and normalizes the result. Empty segments are
 * skipped; with none left the result is `.`.
 *
 * @param segments - the parts of the path
 * @returns the joined, clean path
 *
 * @example
 * posixPath.join("hubs", "support/", "agents", "triage.agent.yaml"); // "hubs/support/agents/triage.agent.yaml"
 */
function join(...segments: readonly string[]): string {
  const parts = segments.filter((segment) => segment !== "");
  if (parts.length === 0) {
    return ".";
  }
  return normalize(parts.join("/"));
}

/**
 * The folder part of a path: everything before the last segment. Trailing
 * slashes don't count as a segment. Meant for clean paths (see `normalize`);
 * for those it gives the same result as `node:path.posix`.
 *
 * @param path - the path
 * @returns the folder, `.` for a bare name and `/` at the root
 *
 * @example
 * posixPath.dirname("hubs/support/agents/triage.agent.yaml"); // "hubs/support/agents"
 */
function dirname(path: string): string {
  const trimmed = trimTrailingSlashes(path);
  if (trimmed === "") {
    return path.startsWith("/") ? "/" : ".";
  }
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash === -1) {
    return ".";
  }
  const folder = trimTrailingSlashes(trimmed.slice(0, lastSlash));
  return folder === "" ? "/" : folder;
}

/**
 * The last segment of a path. Trailing slashes don't count as a segment.
 * Gives the same result as `node:path.posix.basename` without a suffix.
 *
 * @param path - the path
 * @returns the last segment, empty for `""` and `/`
 *
 * @example
 * posixPath.basename("hubs/support/agents/triage.agent.yaml"); // "triage.agent.yaml"
 */
function basename(path: string): string {
  const trimmed = trimTrailingSlashes(path);
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function trimTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") {
    end--;
  }
  return path.slice(0, end);
}

/**
 * Helpers for forward-slash paths that behave like `node:path.posix`:
 * `normalize`, `join`, `dirname` and `basename`.
 */
export const posixPath = { normalize, join, dirname, basename } as const;
