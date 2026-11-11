// Where a harness agent writes: its working folder, found on disk (HAL-189
// 4h). The agent's file names it relative to the workspace, and the format
// check has already refused a name that leaves the workspace or points into
// `.git`, a definition folder or a folder that starts with `.`. On disk a
// folder on the way can still be a symlink or a junction, so each part is
// followed to its real place, and the folder is checked again where it
// really is.

import { mkdir, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { workingFolderProblem } from "@halonicjs/format";

/** What the profile builder reads and makes on disk. */
export interface ProfileDisk {
  /** The path with every link on it resolved; throws when it can't, such as a missing path. */
  realPath(path: string): Promise<string>;
  /** Makes a folder and the folders on its way; a folder that is there already is fine. */
  makeFolder(path: string): Promise<void>;
  /** The names in a folder; throws when it can't list them. */
  listFolder(folder: string): Promise<readonly string[]>;
}

/** This computer's disk. */
export const profileDiskOnThisComputer: ProfileDisk = {
  realPath: (path) => realpath(path),
  async makeFolder(path) {
    await mkdir(path, { recursive: true });
  },
  listFolder: (folder) => readdir(folder),
};

/**
 * The real place of an agent's working folder in `root`, made when it isn't
 * there yet. Each missing part is made inside the real place of the part
 * before it, and only once that part's real place passed the same checks as
 * the working folder, so a link on the way can't send the new folders
 * anywhere else, nor into `.git` or a definition folder.
 *
 * @param root - the real path of the folder the agent works in: the workspace, or its run's proposal folder
 * @param workingFolder - the folder as the agent's file names it, relative to `root`, with `/`
 * @returns the working folder's real path
 * @throws when the folder, as named or at its real place, isn't one the agent
 *   may write: it is `root` itself, leaves `root`, or is in `.git`, a
 *   definition folder or a folder that starts with `.`
 *
 * @example
 * await realWorkingFolder("/srv/acme/site", "files/agents/writer", disk);
 * // "/srv/acme/site/files/agents/writer"
 */
export async function realWorkingFolder(
  root: string,
  workingFolder: string,
  disk: ProfileDisk,
): Promise<string> {
  const namedProblem = workingFolderProblem(workingFolder);
  if (namedProblem !== null) throw new Error(namedProblem);
  let current = root;
  for (const part of workingFolder.split("/")) {
    current = await realOrMade(join(current, part), workingFolder, disk);
    // Checked before the next part is made, so a link on the way into `.git`
    // or a definition folder is refused before anything is made in there.
    refuseRealPlace(root, current, workingFolder, { atEnd: false });
  }
  refuseRealPlace(root, current, workingFolder, { atEnd: true });
  return current;
}

/**
 * Throws when `current`, the real place of a part of the working folder,
 * isn't one the agent may write in or on the way to. On the way, a part may
 * be `root` itself (a link back to it); the working folder at the end may not.
 */
function refuseRealPlace(
  root: string,
  current: string,
  workingFolder: string,
  { atEnd }: { readonly atEnd: boolean },
): void {
  if (!isInsideOrSame(current, root)) {
    throw new Error(
      `The agent's working folder '${workingFolder}' leads out of ${root}, to ${current}.`,
    );
  }
  const way = relative(root, current).split(sep).join("/");
  if (way === "" && !atEnd) return;
  const realProblem = way === "" ? `it is ${root} itself` : workingFolderProblem(way);
  if (realProblem !== null) {
    throw new Error(
      `The agent's working folder '${workingFolder}' is really ${current}, where it can't work: ${realProblem}`,
    );
  }
}

/**
 * The real place of `path`, after making it when it isn't there. A link to
 * a place that isn't there is refused, not followed.
 */
async function realOrMade(path: string, workingFolder: string, disk: ProfileDisk): Promise<string> {
  try {
    return await disk.realPath(path);
  } catch {
    // Not there yet: made below.
  }
  try {
    await disk.makeFolder(path);
    return await disk.realPath(path);
  } catch (error) {
    throw new Error(`The agent's working folder '${workingFolder}' can't be made at ${path}.`, {
      cause: error,
    });
  }
}

/** Whether `path` is `folder` or inside it. Both are absolute, in this computer's notation. */
export function isInsideOrSame(path: string, folder: string): boolean {
  const way = relative(folder, path);
  return way === "" || (!isAbsolute(way) && way !== ".." && !way.startsWith(`..${sep}`));
}

/** Whether `path` is inside `folder`, and isn't `folder` itself. */
export function isStrictlyInside(path: string, folder: string): boolean {
  return isInsideOrSame(path, folder) && relative(folder, path) !== "";
}

/** Whether one of two absolute paths is, or is inside, the other. */
export function overlaps(a: string, b: string): boolean {
  return isInsideOrSame(a, b) || isInsideOrSame(b, a);
}
