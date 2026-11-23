import { lstat, readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { type PathSegments, writeFencedPaths } from "@halonicjs/app";
import { windowsKey } from "./kept-grants.ts";
import { toolFoldersToCreate } from "./windows-tool-folders.ts";

/**
 * The paths below the working folder that a Windows session denies for
 * writing, such as `.npmrc`, `.mcp.json`, `.yarn/releases` and
 * `.claude/settings.json`. srt denies through the access on an existing path,
 * so for each one that isn't there when the session opens, `srt-win acl stamp`
 * makes a placeholder: every missing folder on the way, and an empty file at
 * the end. The tool folders, which Halonic makes itself and keeps (see
 * `prepareToolFolders`), are not counted.
 */
export const denyPlaceholderPaths: readonly PathSegments[] = writeFencedPaths.filter(
  (segments) => !isToolFolder(segments),
);

/** Whether `segments` names one of the tool folders Halonic makes in the working folder's root. */
function isToolFolder(segments: PathSegments): boolean {
  return segments.length === 1 && toolFoldersToCreate.includes(segments[0] ?? "");
}

/**
 * One working folder: how many live sessions use it, and the placeholders
 * that were missing when one opened, relative to it.
 */
interface FolderUse {
  sessions: number;
  missingFiles: Set<string>;
  /** Each missing folder on the way to a file, with how many names deep it is. */
  missingFolders: Map<string, number>;
}

async function isMissing(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    return errorCode(error) === "ENOENT";
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error ? String(error.code) : undefined;
}

/** How a {@link DenyPlaceholders} removes one empty file and one empty folder; a test passes ones that fail. */
export interface PlaceholderRemoval {
  file: (path: string) => Promise<void>;
  folder: (path: string) => Promise<void>;
}

const removeFromDisk: PlaceholderRemoval = { file: unlink, folder: rmdir };

/**
 * Removes the placeholders srt made for a Windows session's denies once the
 * last session on that working folder closes, so the person's folder ends up
 * as it was before (HAL-11554, HAL-16291). srt does the same on Linux.
 *
 * A file is removed only when it was missing when a session opened and is
 * still an empty regular file at the close: a file that was there before, a
 * file with content, and a folder or link put at the path stay. Then a folder
 * srt made on the way, such as `.yarn` for `.yarn/releases`, is removed when
 * it was missing when a session opened and is now an empty folder, deepest
 * first; one that holds anything else stays. A session still open on the
 * folder keeps them all, because removing one would lift that session's deny,
 * which Windows stamps only when it opens. A host that crashes leaves them,
 * as before: at the next start an empty file srt made can't be told from one
 * the person made.
 *
 * One instance serves the whole process (see {@link windowsDenyPlaceholders}),
 * and its steps run one at a time, so a session opening while another one's
 * placeholders are being removed notes them as missing and srt makes them again.
 */
export class DenyPlaceholders {
  /** The working folders of live sessions, by {@link windowsKey}. */
  readonly #folders = new Map<string, FolderUse>();
  readonly #remove: PlaceholderRemoval;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(remove: PlaceholderRemoval = removeFromDisk) {
    this.#remove = remove;
  }

  /**
   * Counts one more live session on `workingFolder` and notes which of
   * {@link denyPlaceholderPaths}, and which folders on the way to them, have
   * nothing at their path. Call it before srt runs anything for the session,
   * and {@link release} on every way the session ends, a failed open
   * included. Never rejects.
   */
  hold(workingFolder: string): Promise<void> {
    return this.#inTurn(async () => {
      const key = windowsKey(workingFolder);
      const use = this.#folders.get(key) ?? {
        sessions: 0,
        missingFiles: new Set<string>(),
        missingFolders: new Map<string, number>(),
      };
      use.sessions += 1;
      this.#folders.set(key, use);
      for (const segments of denyPlaceholderPaths) {
        await noteMissing(workingFolder, segments, use);
      }
    });
  }

  /**
   * Counts one session less on `workingFolder`. When it was the last one,
   * removes each noted file that is still an empty regular file, then each
   * noted folder that is now empty, without following a link. Never rejects.
   *
   * @returns one line for each placeholder it could not remove, for the session to log
   */
  release(workingFolder: string): Promise<string[]> {
    return this.#inTurn(async () => {
      const key = windowsKey(workingFolder);
      const use = this.#folders.get(key);
      if (use === undefined) return [];
      use.sessions -= 1;
      if (use.sessions > 0) return [];
      this.#folders.delete(key);
      const failed: string[] = [];
      for (const file of use.missingFiles) {
        const failure = await removeIfEmptyFile(join(workingFolder, file), this.#remove.file);
        if (failure !== null) failed.push(failure);
      }
      const deepestFirst = [...use.missingFolders].sort(([, a], [, b]) => b - a);
      for (const [folder] of deepestFirst) {
        const failure = await removeIfEmptyFolder(join(workingFolder, folder), this.#remove.folder);
        if (failure !== null) failed.push(failure);
      }
      return failed;
    });
  }

  /** Runs `step` after every step started before it has finished. */
  #inTurn<T>(step: () => Promise<T>): Promise<T> {
    const turn = this.#queue.then(step);
    this.#queue = turn.catch(() => undefined);
    return turn;
  }
}

/**
 * Notes in `use` the file at `segments` when it is missing, and each folder on
 * the way to it that is missing, apart from the tool folders Halonic keeps.
 */
async function noteMissing(
  workingFolder: string,
  segments: PathSegments,
  use: FolderUse,
): Promise<void> {
  for (let depth = 1; depth < segments.length; depth += 1) {
    const folder = segments.slice(0, depth);
    if (isToolFolder(folder)) continue;
    const path = join(...folder);
    if (await isMissing(join(workingFolder, path))) use.missingFolders.set(path, depth);
  }
  const file = join(...segments);
  if (await isMissing(join(workingFolder, file))) use.missingFiles.add(file);
}

/** Removes `path` if it is an empty regular file; returns why it couldn't, or null. */
async function removeIfEmptyFile(
  path: string,
  removeFile: (path: string) => Promise<void>,
): Promise<string | null> {
  try {
    const found = await lstat(path);
    if (found.isFile() && found.size === 0) await removeFile(path);
    return null;
  } catch (error) {
    return errorCode(error) === "ENOENT" ? null : describeFailure(path, error);
  }
}

/** Removes `path` if it is a folder with nothing in it; returns why it couldn't, or null. */
async function removeIfEmptyFolder(
  path: string,
  removeFolder: (path: string) => Promise<void>,
): Promise<string | null> {
  try {
    const found = await lstat(path);
    if (found.isDirectory() && (await readdir(path)).length === 0) await removeFolder(path);
    return null;
  } catch (error) {
    // Something put into it after the look is the person's: the folder stays.
    const kept = ["ENOENT", "ENOTEMPTY", "EEXIST"].includes(errorCode(error) ?? "");
    return kept ? null : describeFailure(path, error);
  }
}

function describeFailure(path: string, error: unknown): string {
  return `${path}: ${error instanceof Error ? error.message : String(error)}`;
}

/** The one {@link DenyPlaceholders} of this process, which every Windows session shares. */
export const windowsDenyPlaceholders = new DenyPlaceholders();
