import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { FileMarks } from "./tree/tree-model.ts";

/** The files of the open workspace, and what the tree says about each. */
export interface FilesListing {
  /** Every file's path from the workspace folder, such as `hubs/p/hub.yaml`; the tree hides local data itself. */
  readonly paths: readonly string[];
  /** The problems and outside changes by path; a file not listed has none. */
  readonly marks: FileMarks;
}

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
  /** Calls `listener` whenever a file, or a mark on one, may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

export const FilesHostService: ServiceKey<FilesHost> = serviceKey<FilesHost>("files.host");
