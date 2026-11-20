import { checkWorkspacePath, segmentAsOpened } from "./definition-store.ts";

/**
 * Folders a caller asks a `DefinitionSource` to leave out of `list()`
 * and `version()` (requirement `ports.definition-store-left-out`): the
 * working folders agents write in and `node_modules`, which can hold tens of
 * thousands of files and no definitions. Loading the workspace asks for it;
 * a caller that copies or compares the workspace doesn't.
 *
 * It is about scale, not privacy: a left-out file still reads, writes and
 * removes as any other. Names compare as {@link segmentAsOpened} gives them,
 * as a file system that ignores case would open them.
 */
export interface LeaveOut {
  /** Folder paths from the store root, such as `repo` or `files/agents/coder`. Everything under one is left out. */
  readonly folders?: readonly string[];
  /** Folder names left out at any depth, such as `node_modules`. One segment each. */
  readonly names?: readonly string[];
}

/** Options for `DefinitionSource.list`. */
export interface ListOptions {
  /** What to leave out of the listing. Leave it out to list every file, as without options. */
  readonly leaveOut?: LeaveOut;
}

/** Options for `DefinitionSource.version`. */
export interface VersionOptions {
  /** Version only what `list()` gives with the same `leaveOut`. */
  readonly leaveOut?: LeaveOut;
}

/**
 * Refuses a {@link LeaveOut} with an unsafe folder path, or a name that isn't
 * a single safe segment, so `a/../b` can't leave out more than it says. Every
 * store calls it before it lists.
 *
 * @throws RangeError naming the folder or name and what is wrong with it
 */
export function checkLeaveOut(leaveOut: LeaveOut | undefined): void {
  for (const folder of leaveOut?.folders ?? []) {
    checkWorkspacePath(folder);
    checkSegmentsNotEmpty(folder);
  }
  for (const name of leaveOut?.names ?? []) {
    checkWorkspacePath(name);
    if (name.includes("/")) {
      throw new RangeError(`Unsafe folder name ${JSON.stringify(name)}: no "/".`);
    }
    checkSegmentsNotEmpty(name);
  }
}

// A segment such as `...` or ` ` is safe as a path but compares as empty, so
// it would match whatever else compares as empty rather than one real folder.
function checkSegmentsNotEmpty(path: string): void {
  if (path.split("/").some((segment) => segmentAsOpened(segment) === "")) {
    throw new RangeError(
      `Unsafe folder ${JSON.stringify(path)}: a segment is empty once its case and trailing dots are folded.`,
    );
  }
}

/**
 * Whether a safe workspace path is left out: it is one of the folders, or
 * inside one, or one of its segments is one of the names. A store that walks
 * folders can ask it for a folder's own path and not step into it.
 *
 * @example
 * isLeftOut("repo/src/a.ts", { folders: ["repo"] }); // true
 * isLeftOut("repository.md", { folders: ["repo"] }); // false
 * isLeftOut("tools/Node_Modules/x/index.js", { names: ["node_modules"] }); // true
 */
export function isLeftOut(path: string, leaveOut: LeaveOut | undefined): boolean {
  if (leaveOut === undefined) {
    return false;
  }
  const segments = path.split("/").map(segmentAsOpened);
  const names = new Set((leaveOut.names ?? []).map(segmentAsOpened));
  if (segments.some((segment) => names.has(segment))) {
    return true;
  }
  return (leaveOut.folders ?? []).some((folder) => startsWithFolder(segments, folder));
}

function startsWithFolder(segments: readonly string[], folder: string): boolean {
  const folderSegments = folder.split("/").map(segmentAsOpened);
  if (folderSegments.length > segments.length) {
    return false;
  }
  return folderSegments.every((segment, index) => segments[index] === segment);
}
