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
  const segments = resolveSegments(path, absolute);
  if (segments.length === 0) {
    return emptyResult(absolute, trailingSlash);
  }
  const normalized = segments.join("/") + (trailingSlash ? "/" : "");
  return absolute ? `/${normalized}` : normalized;
}

function resolveSegments(path: string, absolute: boolean): string[] {
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
  return segments;
}

function emptyResult(absolute: boolean, trailingSlash: boolean): string {
  if (absolute) {
    return "/";
  }
  return trailingSlash ? "./" : ".";
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
 * Whether a path starts at the root. Gives the same result as
 * `node:path.posix.isAbsolute`; it only reads the string, never a cwd.
 *
 * @param path - the path
 * @returns `true` when the path starts with `/`
 *
 * @example
 * posixPath.isAbsolute("/workspace/hubs"); // true
 */
function isAbsolute(path: string): boolean {
  return path.startsWith("/");
}

/** The segments of an absolute path once it is clean: `/` has none. */
function absoluteSegments(path: string): string[] {
  return normalize(path)
    .split("/")
    .filter((segment) => segment !== "");
}

/**
 * The way from one absolute path to another, the same as
 * `node:path.posix.relative` gives for two absolute paths. It never resolves
 * against a cwd: a relative input is refused, because a containment check
 * built on a guessed cwd could pass a path it shouldn't.
 *
 * @param from - the absolute path to start from
 * @param to - the absolute path to reach
 * @returns the relative way, `""` when both are the same place
 * @throws Error when either path isn't absolute
 *
 * @example
 * posixPath.relative("/workspace/hubs", "/workspace/hubs/support/agents"); // "support/agents"
 * posixPath.relative("/workspace/hubs", "/workspace/skills"); // "../skills"
 */
function relative(from: string, to: string): string {
  for (const path of [from, to]) {
    if (!isAbsolute(path)) {
      throw new Error(`posixPath.relative takes only absolute paths, and "${path}" isn't one.`);
    }
  }
  const fromSegments = absoluteSegments(from);
  const toSegments = absoluteSegments(to);
  let shared = 0;
  while (
    shared < fromSegments.length &&
    shared < toSegments.length &&
    fromSegments[shared] === toSegments[shared]
  ) {
    shared++;
  }
  const up = fromSegments.slice(shared).map(() => "..");
  return [...up, ...toSegments.slice(shared)].join("/");
}

/**
 * Helpers for forward-slash paths that behave like `node:path.posix`:
 * `normalize`, `join`, `dirname`, `basename`, `isAbsolute` and `relative`,
 * with `sep` the separator they use.
 */
export const posixPath = {
  normalize,
  join,
  dirname,
  basename,
  isAbsolute,
  relative,
  sep: "/",
} as const;
