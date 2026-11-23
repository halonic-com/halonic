// The files `search` and `repo_map` look at. Git isn't started for this:
// starting git in a repo runs what the repo's own config names, such as
// `core.fsmonitor`, so a repo could run code through a tool that is allowed
// without asking (HAL-16748). The walk reads the ignore files itself.

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ignoredByPatterns, type PathPattern, readIgnoreFile } from "@halonicjs/std";
import { shownPath, type ToolFolders } from "../folders.ts";

/** Folders never walked into, whatever the ignore files say. */
const alwaysSkipped = new Set([".git", "node_modules"]);

/** The most files one walk gives, so a huge folder can't keep a call busy. */
export const maxWalkedFiles = 50_000;

/** The largest ignore file read; a bigger one is left out. */
const maxIgnoreFileBytes = 256 * 1024;

/** One file the walk found. */
export interface WalkedFile {
  /** Relative to the working folder, with `/`. */
  readonly path: string;
  /** Where it is. */
  readonly real: string;
}

/** The ignore patterns of one folder's `.gitignore`. */
interface IgnoreLevel {
  /** The folder, relative to the working folder with `/`; `""` for the working folder. */
  readonly base: string;
  readonly patterns: readonly PathPattern[];
}

/**
 * A walk through a folder in the working folder (requirement
 * `coding-tools.search`): every plain file, in name order, leaving out
 * `.git`, `node_modules`, what the `.gitignore` files in the working folder
 * and `.git/info/exclude` ignore, and every link, so a walk never leaves the
 * working folder or goes round in a loop. It stops after
 * {@link maxWalkedFiles} files.
 */
export class FileWalk {
  readonly #folders: ToolFolders;
  #given = 0;
  #unreadable = 0;

  constructor(folders: ToolFolders) {
    this.#folders = folders;
  }

  /** Whether the walk stopped at {@link maxWalkedFiles} files. */
  get stoppedEarly(): boolean {
    return this.#given >= maxWalkedFiles;
  }

  /** How many folders couldn't be listed, such as ones the sandbox denies. */
  get unreadableFolders(): number {
    return this.#unreadable;
  }

  /**
   * The files in `start`, a real folder in the working folder.
   */
  async *files(start: string): AsyncGenerator<WalkedFile> {
    const levels = await this.#levelsDownTo(start);
    yield* this.#walk(start, levels);
  }

  async *#walk(folder: string, levels: readonly IgnoreLevel[]): AsyncGenerator<WalkedFile> {
    const entries = await this.#entries(folder);
    const here = [...levels, await ignoreLevel(folder, this.#folders)];
    for (const entry of entries) {
      if (this.stoppedEarly) return;
      const real = join(folder, entry.name);
      const path = shownPath(real, this.#folders);
      const isFolder = entry.isDirectory();
      if (entry.isSymbolicLink() || isIgnored(here, path, isFolder)) continue;
      if (isFolder && !alwaysSkipped.has(entry.name)) yield* this.#walk(real, here);
      if (entry.isFile()) {
        this.#given += 1;
        yield { path, real };
      }
    }
  }

  /** The folder's entries in name order, or none when it can't be listed. */
  async #entries(folder: string): Promise<Dirent[]> {
    try {
      const entries = await readdir(folder, { withFileTypes: true });
      return entries.sort((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name)));
    } catch {
      // A folder the sandbox denies, or one removed meanwhile: counted, and the walk goes on.
      this.#unreadable += 1;
      return [];
    }
  }

  /** The ignore files of the folders above `start`, from the working folder down, and `.git/info/exclude`. */
  async #levelsDownTo(start: string): Promise<IgnoreLevel[]> {
    const root = this.#folders.workingFolder;
    const exclude = await ignoreFileText(join(root, ".git", "info", "exclude"));
    const levels: IgnoreLevel[] = [{ base: "", patterns: readIgnoreFile(exclude) }];
    const way = shownPath(start, this.#folders);
    if (way === ".") return levels;
    let folder = root;
    for (const part of ["", ...way.split("/").slice(0, -1)]) {
      folder = join(folder, part);
      levels.push(await ignoreLevel(folder, this.#folders));
    }
    return levels;
  }
}

/** The patterns of the folder's own `.gitignore`. */
async function ignoreLevel(folder: string, folders: ToolFolders): Promise<IgnoreLevel> {
  const base = shownPath(folder, folders);
  const text = await ignoreFileText(join(folder, ".gitignore"));
  return { base: base === "." ? "" : base, patterns: readIgnoreFile(text) };
}

/** An ignore file's text; empty when it isn't there, can't be read or is too large. */
async function ignoreFileText(path: string): Promise<string> {
  try {
    const bytes = await readFile(path);
    return bytes.length > maxIgnoreFileBytes ? "" : bytes.toString("utf8");
  } catch {
    // No ignore file here, which is the usual case.
    return "";
  }
}

/** Whether the deepest ignore file with a say ignores the path, as Git decides it. */
function isIgnored(levels: readonly IgnoreLevel[], path: string, isFolder: boolean): boolean {
  for (const level of levels.toReversed()) {
    if (level.base !== "" && !path.startsWith(`${level.base}/`)) continue;
    const inside = level.base === "" ? path : path.slice(level.base.length + 1);
    const said = ignoredByPatterns(level.patterns, inside, isFolder);
    if (said !== undefined) return said;
  }
  return false;
}
