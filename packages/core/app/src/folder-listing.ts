// The checks a folder of code gets before Halonic reads it, shared by the
// plugin folder (`app.plugin-folder`, P2 plan section 3) and a workspace's
// local integration folder (`app.integration-folder`): the limits, and a
// refusal of any link or special file on the listing alone (A12). One copy,
// so a fix to a check reaches both readers.

import type { FolderEntry, FolderReader } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";

/** At most this many files and folders in one folder of code (D3), so hashing stays cheap. */
export const MAX_FOLDER_ENTRIES = 2_000;

/** At most this many bytes in one folder of code's files together (D3). */
export const MAX_FOLDER_BYTES = 50 * 1024 * 1024;

/**
 * Something wrong with a folder of code. Studio shows it on the folder's
 * row, and the CLI prints it.
 */
export interface FolderProblem {
  /** Names the rule, such as `link` or a manifest problem's own code. */
  readonly code: string;
  /** The file it is about, from the folder, such as `plugin.yaml`; `""` for the folder itself. */
  readonly file: string;
  /** Where in the manifest, as keys and list indexes; `[]` when it isn't about one value. */
  readonly path: readonly (string | number)[];
  readonly message: string;
  /** For a problem in the manifest: its 1-based line and column. */
  readonly line?: number;
  readonly col?: number;
}

/** How the messages name the folder and what is in it, such as a plugin or an integration. */
export interface FolderNoun {
  /** The folder at the start of a sentence, such as "The plugin folder". */
  readonly theFolder: string;
  /** Any such folder at the start of a sentence, such as "A plugin folder". */
  readonly aFolder: string;
  /** Its files at the start of a sentence, such as "The plugin folder's files". */
  readonly theFiles: string;
  /** What the folder holds, such as "a plugin". */
  readonly one: string;
  /** What the folder holds, named, such as "the plugin". */
  readonly it: string;
  /** How to leave a `.git` folder out, such as "install the plugin without it". */
  readonly withoutGit: string;
}

/** Problems the listing alone shows: past a limit, or a link or special file anywhere. */
export function listingProblems(
  entries: readonly FolderEntry[],
  folder: string,
  noun: FolderNoun,
): FolderProblem[] {
  if (entries.length > MAX_FOLDER_ENTRIES) {
    return [
      folderProblem(
        "too-many-files",
        `${noun.theFolder} holds more than ${MAX_FOLDER_ENTRIES.toLocaleString("en")} files and folders, the most ${noun.one} may have. A .git folder inside it counts too: ${noun.withoutGit}.`,
      ),
    ];
  }
  const bytes = entries.reduce(
    (total, entry) => total + (entry.kind === "file" ? entry.size : 0),
    0,
  );
  if (bytes > MAX_FOLDER_BYTES) return [tooLargeProblem(noun)];
  return entries.flatMap((entry): FolderProblem[] => {
    const file = inFolder(entry.path, folder);
    if (entry.kind === "link") {
      return [
        fileProblem(
          "link",
          file,
          `${file} is a link. ${noun.aFolder} holds only files and folders, so a link can't point Halonic at a file it didn't check.`,
        ),
      ];
    }
    if (entry.kind === "other") {
      return [
        fileProblem(
          "special-file",
          file,
          `${file} is a special file, such as a pipe or a socket. ${noun.aFolder} holds only files and folders.`,
        ),
      ];
    }
    return [];
  });
}

/**
 * Reads files of one folder and counts the bytes it read, because the
 * listing's sizes can be out of date: a file that grew after the listing
 * stops the reads that follow it once the folder's files pass the limit.
 */
export class CountingReader {
  readonly #reader: FolderReader;
  readonly #folder: string;
  readonly #noun: FolderNoun;
  #bytesRead = 0;

  constructor(reader: FolderReader, folder: string, noun: FolderNoun) {
    this.#reader = reader;
    this.#folder = folder;
    this.#noun = noun;
  }

  /** The bytes of `path`, from the folder, or why they can't be used. */
  async read(path: string): Promise<Result<Uint8Array, FolderProblem>> {
    const bytes = await this.#reader.read(`${this.#folder}/${path}`);
    if (bytes === null) return err(changedWhileReadProblem(path, this.#noun));
    this.#bytesRead += bytes.length;
    if (this.#bytesRead > MAX_FOLDER_BYTES) return err(tooLargeProblem(this.#noun));
    return ok(bytes);
  }
}

export function tooLargeProblem(noun: FolderNoun): FolderProblem {
  return folderProblem(
    "too-large",
    `${noun.theFiles} come to more than ${MAX_FOLDER_BYTES / (1024 * 1024)} MB, the most ${noun.one} may have. A .git folder inside it counts too: ${noun.withoutGit}.`,
  );
}

/** `file`, or the folder itself for `""`, was gone when Halonic came to read it. */
export function changedWhileReadProblem(file: string, noun: FolderNoun): FolderProblem {
  return fileProblem(
    "changed-while-read",
    file,
    `${file === "" ? noun.theFolder : file} was removed while Halonic read ${noun.it}. Load it again.`,
  );
}

/** `path` from the folder: `weather/backend/index.js` is `backend/index.js` in `weather`. */
export function inFolder(path: string, folder: string): string {
  return path.slice(folder.length + 1);
}

export function folderProblem(code: string, message: string): FolderProblem {
  return { code, file: "", path: [], message };
}

export function fileProblem(code: string, file: string, message: string): FolderProblem {
  return { code, file, path: [], message };
}
