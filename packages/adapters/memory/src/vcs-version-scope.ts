import {
  isPrivateWorkspacePath,
  unversionedFolders,
  type VcsCommitVersionOptions,
} from "@halonicjs/ports";
import { checkVcsPath } from "./vcs-input.ts";
import type { Tree } from "./vcs-repository.ts";

/** The paths Create version commits: under `include` (everywhere when absent), not under `exclude`. */
export interface VersionScope {
  readonly include?: readonly string[];
  readonly exclude: readonly string[];
}

/**
 * The scope of a `commitVersion` call, after checking every path in it.
 *
 * @throws RangeError for a path the port refuses, or an empty `include`,
 *   which would commit nothing at all
 */
export function versionScope(options: VcsCommitVersionOptions): VersionScope {
  const { include, exclude } = options;
  if (include !== undefined && include.length === 0) {
    throw new RangeError("Give at least one path to include, or leave include out.");
  }
  include?.forEach(checkVcsPath);
  exclude.forEach(checkVcsPath);
  return include === undefined ? { exclude } : { include, exclude };
}

/** Whether Create version commits `path`'s change. A private entry or a review record never is. */
export function inScope(path: string, scope: VersionScope): boolean {
  if (isPrivateWorkspacePath(path) || isUnderAny(path, unversionedFolders)) return false;
  if (scope.include !== undefined && !isUnderAny(path, scope.include)) return false;
  return !isUnderAny(path, scope.exclude);
}

/**
 * The tree Create version commits: HEAD's files, with every change in
 * `working` (the files on disk) that is in scope. A path out of scope keeps
 * its content at HEAD, whatever the disk or the index holds.
 */
export function versionTree(head: Tree, working: Tree, scope: VersionScope): Tree {
  const tree = new Map(head);
  for (const path of head.keys()) {
    if (inScope(path, scope) && !working.has(path)) tree.delete(path);
  }
  for (const [path, content] of working) {
    if (inScope(path, scope)) tree.set(path, content);
  }
  return tree;
}

/**
 * The index after Create version: every path in scope takes the new tree's
 * content, and every other path stays as it was, staged change and all.
 */
export function indexAfterVersion(
  index: Tree,
  tree: Tree,
  scope: VersionScope,
): Map<string, string> {
  const after = new Map([...index].filter(([path]) => !inScope(path, scope)));
  for (const [path, content] of tree) {
    if (inScope(path, scope)) after.set(path, content);
  }
  return after;
}

/** Whether `path` is one of `paths`, or a file inside one of them as a folder. */
function isUnderAny(path: string, paths: readonly string[]): boolean {
  return paths.some((each) => path === each || path.startsWith(`${each}/`));
}
