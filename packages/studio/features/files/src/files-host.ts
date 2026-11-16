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
  /** Calls `listener` whenever a file, or a mark on one, may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

export const FilesHostService: ServiceKey<FilesHost> = serviceKey<FilesHost>("files.host");
