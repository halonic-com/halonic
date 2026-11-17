import type { FileChange } from "@halonicjs/app";
import type {
  ChangesRead,
  FileTexts,
  Identity,
  UpdateChoice,
  UpdateMerge,
  UpdatesResult,
  Version,
} from "./api.ts";

/** How many versions History shows first, and how many more Show more adds. */
export const historyPageSize = 20;

/** What History holds now: the newest versions of the workspace folder. */
export interface HistoryState {
  /** The newest versions, newest first; empty before the first read worked and for a new repository. */
  readonly versions: readonly Version[];
  /** Whether the workspace has older versions than `versions`. */
  readonly more: boolean;
  /** Whether a read worked yet, so "No versions yet." isn't said while it still loads. */
  readonly loaded: boolean;
  /** Why the last read failed, until one works; `versions` stay as they were. */
  readonly error: unknown;
}

/** One changed file: what changed in it, and the texts the changes can be undone from. */
export interface ChangedFile {
  readonly path: string;
  /** The old path, for a file that was renamed. */
  readonly from?: string;
  readonly description: FileChange;
  /** `undefined` when the file couldn't be read as text; its lines then have no parts to undo. */
  readonly texts: FileTexts | undefined;
}

/** What {@link ChangesList.undoChange} did. */
export type UndoOutcome =
  /** The change is undone; `undo` puts it back, as the toast's Undo does, and says why when it can't. */
  | { readonly kind: "undone"; readonly undo: () => Promise<string | undefined> }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * What {@link ChangesList.discardFile} did; the toast's Undo is `undo`, as for an undone change.
 * `noCopy` is a refusal: the copy couldn't be kept, so nothing was changed and the person is asked
 * first. `discarded` is a discard they went on with anyway, which has no Undo for the person;
 * `putBack` is for Halonic only, to roll it back when a later file of the same item fails.
 */
export type DiscardOutcome =
  | UndoOutcome
  | { readonly kind: "noCopy" }
  | { readonly kind: "discarded"; readonly putBack: () => Promise<string | undefined> };

/** What {@link ChangesList.getUpdates} did. */
export type UpdatesOutcome =
  | UpdatesResult
  /** Both sides had new versions: the merge is started and the person chooses item by item. */
  | { readonly kind: "choosing" }
  | { readonly kind: "failed"; readonly reason: string };

/** What a choice, Undo, Finish or Cancel of a started merge did: the reason it didn't work, or `undefined`. */
export type MergeOutcome = string | undefined;

export type { UpdateChoice };

/** What the Changes list holds now. */
export interface ChangesListState {
  /** The last read that worked; `undefined` before the first one. */
  readonly read: ChangesRead | undefined;
  /** What changed in each file of `read`, one entry for each path. Empty until a read worked. */
  readonly files: readonly ChangedFile[];
  /** Why the last read failed, until one works; `read` stays as it was. */
  readonly error: unknown;
  /** Why Turn on history failed, until the next try. */
  readonly turnOnError: unknown;
  /** Whether Turn on history is working. */
  readonly turningOn: boolean;
  /** Whether the folder has a place to get updates from, as of the last read that worked. */
  readonly hasRemote: boolean;
  /** Whether Get updates is working. */
  readonly gettingUpdates: boolean;
  /** The merge of both sides' versions that is started and not finished; `undefined` when none is. */
  readonly merge: UpdateMerge | undefined;
  /**
   * Whether the choices are open on the page. A merge found left open (the window was closed) is
   * not open until Continue; one just started is.
   */
  readonly choosing: boolean;
  /** Whether a choice, Undo, Finish or Cancel is working. */
  readonly mergeBusy: boolean;
  /**
   * Who versions are from, as of the last read that worked; `undefined` before one. Create version
   * asks first while a part of it is not set.
   */
  readonly identity: Identity | undefined;
  /**
   * Set while Create version is open: the paths it opened with, or `undefined` inside for every
   * changed file. `undefined` when it is closed.
   */
  readonly version: { readonly paths: readonly string[] | undefined } | undefined;
  /** The workspace's versions; only read while the folder is a git repository. */
  readonly history: HistoryState;
}
