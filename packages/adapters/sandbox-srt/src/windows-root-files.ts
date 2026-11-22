import { lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { writeFencedPaths } from "@halonicjs/app";
import { windowsKey } from "./kept-grants.ts";
import { toolFoldersToCreate } from "./windows-tool-folders.ts";

/**
 * The files in the root of the working folder that a Windows session denies
 * for writing, such as `.npmrc`, `.mcp.json` and `.pre-commit-config.yaml`.
 * srt denies through the access on an existing path, so `srt-win acl stamp`
 * makes an empty file for each one that isn't there when the session opens.
 * The tool folders, which Halonic makes itself (see `prepareToolFolders`),
 * and entries further down are not counted.
 */
export const rootDenyFiles: readonly string[] = writeFencedPaths.flatMap(([name, ...rest]) =>
  name !== undefined && rest.length === 0 && !toolFoldersToCreate.includes(name) ? [name] : [],
);

/** One working folder: how many live sessions use it, and the root files that were missing when one opened. */
interface FolderUse {
  sessions: number;
  missing: Set<string>;
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

/**
 * Removes the empty root files srt made for a Windows session's denies once
 * the last session on that working folder closes, so the person's folder ends
 * up as it was before (HAL-11554). srt does the same on Linux.
 *
 * A file is removed only when it was missing when a session opened and is
 * still an empty regular file at the close: a file that was there before, a
 * file with content, and a folder or link put at the path stay. A session
 * still open on the folder keeps them all, because removing a file would lift
 * that session's deny, which Windows stamps only when it opens. A host that
 * crashes leaves them, as before: at the next start an empty file srt made
 * can't be told from one the person made.
 *
 * One instance serves the whole process (see {@link windowsRootFiles}), and
 * its steps run one at a time, so a session opening while another one's
 * files are being removed notes them as missing and srt makes them again.
 */
export class RootFilePlaceholders {
  /** The working folders of live sessions, by {@link windowsKey}. */
  readonly #folders = new Map<string, FolderUse>();
  readonly #removeFile: (path: string) => Promise<void>;
  #queue: Promise<unknown> = Promise.resolve();

  /** @param removeFile removes one file; a test passes one that fails */
  constructor(removeFile: (path: string) => Promise<void> = unlink) {
    this.#removeFile = removeFile;
  }

  /**
   * Counts one more live session on `workingFolder` and notes which of
   * {@link rootDenyFiles} have nothing at their path. Call it before srt runs
   * anything for the session, and {@link release} on every way the session
   * ends, a failed open included. Never rejects.
   */
  hold(workingFolder: string): Promise<void> {
    return this.#inTurn(async () => {
      const key = windowsKey(workingFolder);
      const use = this.#folders.get(key) ?? { sessions: 0, missing: new Set<string>() };
      use.sessions += 1;
      this.#folders.set(key, use);
      for (const name of rootDenyFiles) {
        if (await isMissing(join(workingFolder, name))) use.missing.add(name);
      }
    });
  }

  /**
   * Counts one session less on `workingFolder`. When it was the last one,
   * removes each noted file that is still an empty regular file, without
   * following a link. Never rejects.
   *
   * @returns one line for each file it could not remove, for the session to log
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
      for (const name of use.missing) {
        const failure = await removeIfEmptyFile(join(workingFolder, name), this.#removeFile);
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
    if (errorCode(error) === "ENOENT") return null;
    return `${path}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** The one {@link RootFilePlaceholders} of this process, which every Windows session shares. */
export const windowsRootFiles = new RootFilePlaceholders();
