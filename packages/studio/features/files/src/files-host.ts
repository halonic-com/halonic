import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { FileMarks } from "./tree/tree-model.ts";

/** The files of the open workspace, and what the tree says about each. */
export interface FilesListing {
  /** Every file's path from the workspace folder, such as `hubs/p/hub.yaml`; the tree hides local data itself. */
  readonly paths: readonly string[];
  /** The problems and outside changes by path; a file not listed has none. */
  readonly marks: FileMarks;
}

/** One thing wrong with a file, and where in its text. */
export interface FileIssue {
  /** The file's path, such as `hubs/p/hub.yaml`. */
  readonly file: string;
  /** An error makes the file fail; a warning only informs. */
  readonly severity: "error" | "warning";
  /** What is wrong, in one sentence. */
  readonly message: string;
  /** 1-based line and column in the file's text. */
  readonly line: number;
  readonly col: number;
}

/** A file that was deleted, and the way to bring it back. */
export interface RemovedFile {
  /** How many places in other files named the file by its id and now show an error. */
  readonly places: number;
  /** Puts the file back while the delete is still the newest step; rejects with an `Error` whose message is one sentence when it can't. */
  undo(): Promise<void>;
}

/** How a file differs outside Halonic while its unsaved changes wait for Compare. */
export type OutsideChange = "changed" | "deleted";

/** The two texts of a file that changed outside Halonic; `null` is no file. */
export interface FileCompare {
  readonly path: string;
  /** The text with the user's unsaved changes. */
  readonly mine: string | null;
  /** The text in the folder now. */
  readonly theirs: string | null;
  /** The two put together, or `null` when they can't be: Combine both is offered only when it is set. */
  readonly combined: string | null;
}

/** What the user chooses in Compare. */
export type CompareChoice = "keep-mine" | "use-other" | "combine-both";

/** The workspace's files. The app provides it for each open workspace. */
export interface FilesHost {
  /** Lists the files. Rejects with an `Error` whose message is one sentence when the folder can't be read. */
  list(): Promise<FilesListing>;
  /** A file's text with the unsaved changes applied, or `null` when there is no such file. */
  read(path: string): Promise<string | null>;
  /**
   * Replaces a file's text as the user types. Typing in one file is one undo step, and the
   * workspace saves a moment after typing stops.
   */
  edit(path: string, text: string): void;
  /**
   * Makes an empty file at `path`, and the folders on the way, as one undo step. Rejects with an
   * `Error` whose message is one sentence, such as "workspace.yaml already exists.", when it can't.
   */
  create(path: string): Promise<void>;
  /**
   * How many places in other files name the file by its id and would change if it were renamed to
   * `to`: the "Also updates 3 places" of the Rename dialog. Zero for a file nothing names.
   */
  renameImpact(from: string, to: string): Promise<number>;
  /**
   * Moves a file to `to`, and the places that name it, as one undo step. Rejects with an `Error`
   * whose message is one sentence, such as "workspace.yaml already exists.", when it can't.
   */
  rename(from: string, to: string): Promise<void>;
  /**
   * Deletes a file as one change that goes to the trash when saved. Rejects with an `Error` whose
   * message is one sentence when it can't.
   */
  remove(path: string): Promise<RemovedFile>;
  /**
   * Every error and warning in the workspace's files, with the unsaved changes applied, errors
   * and warnings of one file in the order of the text. Resolves to none when the files can't be checked.
   */
  problems(): Promise<readonly FileIssue[]>;
  /** The files that changed outside Halonic while they had unsaved changes, by path. Their saving is paused. */
  outside(): ReadonlyMap<string, OutsideChange>;
  /** Both texts of a file in {@link FilesHost.outside}, read again from the folder now. */
  compare(path: string): Promise<FileCompare>;
  /**
   * Settles a file in {@link FilesHost.outside} with the user's choice. It is saved at once and is
   * one undo step. Rejects when Combine both is chosen and the texts can't be combined.
   */
  settle(path: string, choice: CompareChoice): Promise<void>;
  /**
   * Marks files a save left alone because they changed outside Halonic, `null` for one that is
   * gone, so they wait for Compare like the ones the watch held. The app calls it with what the
   * save reported.
   */
  noteHeld(held: readonly { readonly path: string; readonly current: string | null }[]): void;
  /**
   * Calls `listener` with the files the host took in from outside Halonic, because they had no
   * unsaved changes (a deleted one counts), after each batch. Returns a function that stops the calls.
   */
  onReloaded(listener: (paths: readonly string[]) => void): () => void;
  /** Calls `listener` whenever a file, or a mark on one, may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

export const FilesHostService: ServiceKey<FilesHost> = serviceKey<FilesHost>("files.host");
