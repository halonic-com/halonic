// A fresh folder for every box (grant rule 6, HAL-3503). On the real PC, the
// only folder that failed was one the boxes had reused since 10 Nov; fresh
// folders in the same places worked. So every session gets a new folder,
// it is removed when the session closes, and folders a crash left behind are
// removed the next time Halonic starts one.

import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * Where box folders live, inside Halonic's data folder
 * (`%LOCALAPPDATA%\halonic`). Kept in this one constant: if the deciding run
 * on the PC (HAL-7514) shows that AppData\Local itself is the problem, only
 * this moves.
 */
export const boxFoldersBase = "mxc-boxes";

/** What box folders need from the disk and the process table. A test hands in a fake one. */
export interface BoxDisk {
  /** Creates `path` and its parents; nothing happens when it is there. */
  makeFolder(path: string): Promise<void>;
  /** Creates a new, empty folder whose name starts with `prefix`, and returns its path. */
  makeFreshFolder(prefix: string): Promise<string>;
  /** The names in a folder; none when it isn't there. */
  names(folder: string): Promise<string[]>;
  /** Removes a folder and everything in it; nothing happens when it isn't there. */
  remove(path: string): Promise<void>;
  /** Whether a process with this id is running. */
  isRunning(processId: number): boolean;
}

/** A box's own folder, for one session only. */
export interface BoxFolder {
  /** The folder's path. */
  path: string;
  /** Removes the folder and everything in it. Calling it again does nothing. */
  remove(): Promise<void>;
}

/** A box folder's name: `box-<process id>-<random>`, so a leftover tells whose it was. */
const boxFolderName = /^box-(\d+)-/;

/**
 * Makes box folders under one Halonic data folder. Each folder's name holds
 * the id of the process that made it, so clearing leftovers never removes a
 * folder that another running Halonic (the CLI next to Studio) still uses.
 *
 * @example
 * const boxes = new BoxFolders(dataFolder, process.pid);
 * const box = await boxes.create(); // %LOCALAPPDATA%\halonic\mxc-boxes\box-4242-aB3xYz
 * await box.remove();
 */
export class BoxFolders {
  readonly #base: string;
  readonly #processId: number;
  readonly #disk: BoxDisk;
  #leftoversCleared: Promise<void> | null = null;

  /**
   * @param dataFolder - Halonic's data folder, `%LOCALAPPDATA%\halonic` unless `HALONIC_HOME` moves it
   * @param processId - this process's id, written into every folder name
   */
  constructor(dataFolder: string, processId: number, disk: BoxDisk = diskOnThisMachine) {
    this.#base = join(dataFolder, boxFoldersBase);
    this.#processId = processId;
    this.#disk = disk;
  }

  /**
   * A new, empty box folder, never one used before. The first call also
   * removes the folders of processes that no longer run, such as after a crash.
   *
   * @throws when the folder can't be created, or removing a leftover fails for a reason other than a program holding it
   */
  async create(): Promise<BoxFolder> {
    // A failed clean-up is tried again by the next call, not remembered.
    this.#leftoversCleared ??= this.#clearLeftovers().catch((error: unknown) => {
      this.#leftoversCleared = null;
      throw error;
    });
    await this.#leftoversCleared;
    const path = await this.#disk.makeFreshFolder(join(this.#base, `box-${this.#processId}-`));
    let removed: Promise<void> | null = null;
    return {
      path,
      remove: () => {
        removed ??= this.#disk.remove(path);
        return removed;
      },
    };
  }

  async #clearLeftovers(): Promise<void> {
    await this.#disk.makeFolder(this.#base);
    for (const name of await this.#disk.names(this.#base)) {
      const owner = boxFolderName.exec(name)?.[1];
      if (owner === undefined) continue;
      // This process's own folders belong to sessions that are still open:
      // each removes its own when it closes.
      const processId = Number(owner);
      if (processId === this.#processId || this.#disk.isRunning(processId)) continue;
      await this.#removeLeftover(join(this.#base, name));
    }
  }

  /**
   * Removes one leftover, skipping it while Windows holds it: a boxed program
   * can outlive the Halonic that started it and keep files open in its folder.
   * New boxes don't need that folder, so it is tried again the next time a
   * process clears leftovers. Any other failure still stops the box.
   */
  async #removeLeftover(path: string): Promise<void> {
    try {
      await this.#disk.remove(path);
    } catch (error) {
      if (!heldOpenCodes.has(String(codeOf(error)))) throw error;
    }
  }
}

/** What Windows reports for a folder it can't remove while a program holds files in it. */
const heldOpenCodes = new Set(["EBUSY", "EPERM", "EACCES", "ENOTEMPTY"]);

/** The real disk and process table. */
export const diskOnThisMachine: BoxDisk = {
  makeFolder: async (path) => {
    await mkdir(path, { recursive: true });
  },
  makeFreshFolder: (prefix) => mkdtemp(prefix),
  names: async (folder) => {
    try {
      return await readdir(folder);
    } catch (error) {
      if (codeOf(error) === "ENOENT") return [];
      throw error;
    }
  },
  remove: (path) => rm(path, { recursive: true, force: true }),
  isRunning: (processId) => {
    try {
      // Signal 0 checks that the process exists without touching it.
      process.kill(processId, 0);
      return true;
    } catch (error) {
      // EPERM: it runs, but as someone else.
      return codeOf(error) === "EPERM";
    }
  },
};

function codeOf(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}
