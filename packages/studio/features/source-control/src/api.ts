/**
 * The services and types other features may use. Features import each
 * other only through this file. The app provides `ChangesSourceService` for
 * each open workspace; the Changes page and the sidebar's count read it.
 */
import type { VcsChange } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** What the workspace folder's history holds right now. */
export type ChangesRead =
  /** The folder is a git repository; `changes` is every changed file since the last version. */
  | { readonly kind: "ready"; readonly changes: readonly VcsChange[] }
  /** The folder isn't a git repository yet. */
  | { readonly kind: "not-a-repository" }
  /** The git program isn't on this computer. */
  | { readonly kind: "no-git" }
  /**
   * The folder sits inside a larger git repository, so git's answer would be about that one.
   * Until Halonic can keep a history of the folder itself (HAL-9756), the page only says so.
   */
  | { readonly kind: "nested-repository" };

/** One changed file's text in the last version and now. `null` is a file that isn't there. */
export interface FileTexts {
  readonly before: string | null;
  readonly after: string | null;
}

/** What {@link ChangesSource.replaceFile} did. */
export type ReplaceResult = "replaced" | "changed-on-disk";

/** One file's text as a discard found it, for {@link ChangesSource.keepCopy}. */
export interface KeptFile {
  readonly path: string;
  readonly text: string;
}

/** What {@link ChangesSource.createVersion} records. */
export interface VersionInput {
  /** The message of the version: its name, then its notes. */
  readonly message: string;
  /** The files that go into it, from the workspace folder; a renamed file lists both its paths. */
  readonly paths: readonly string[];
}

/** Who versions are from: the name and email git writes on each one. An empty text is not set. */
export interface Identity {
  readonly name: string;
  readonly email: string;
}

/** One version in the history: a recorded set of changes. */
export interface Version {
  /** The version's full id. */
  readonly id: string;
  /** Its name: the first line of its message. */
  readonly name: string;
  /** The rest of its message; empty when it has none. */
  readonly notes: string;
  /** Who recorded it. */
  readonly author: string;
  /** When it was recorded, in milliseconds since 1970. */
  readonly at: number;
  /** The files it changed, from the workspace folder; none for a version that changed nothing. */
  readonly files: readonly string[];
}

/** What {@link ChangesSource.getUpdates} found. */
export type UpdatesResult =
  /** The shared copy had `count` newer versions; they are in the workspace now. */
  | { readonly kind: "got"; readonly count: number }
  /** The shared copy has nothing newer. */
  | { readonly kind: "up-to-date" }
  /** The shared copy and this workspace both have versions the other lacks; nothing was changed. */
  | { readonly kind: "both-moved" };

/** How one item both sides changed is settled: this side's, the shared copy's, or both. */
export type UpdateChoice = "mine" | "theirs" | "both";

/** One item that both this workspace and the shared copy changed, and the person must choose for. */
export interface UpdateItem {
  readonly path: string;
  /** The item's text in this workspace's last version; `null` where this side deleted it. */
  readonly mine: string | null;
  /** The item's text in the shared copy; `null` where the shared copy deleted it. */
  readonly theirs: string | null;
  /** What the person chose, `undefined` while they haven't. */
  readonly choice: UpdateChoice | undefined;
  /** Where the shared copy's text was saved by `both`; `undefined` for every other choice. */
  readonly copy: string | undefined;
}

/** A merge of the shared copy's versions into this workspace that is started and not finished. */
export interface UpdateMerge {
  /** The items to choose for, sorted by path. */
  readonly items: readonly UpdateItem[];
  /** How many versions the shared copy has that this workspace lacked. */
  readonly versions: number;
  /** Who recorded those versions, each name once, in the order they first appear. */
  readonly people: readonly string[];
}

/** What {@link ChangesSource.startMerge} found. */
export type MergeStart =
  /** Both sides have new versions; the merge is started and nothing is chosen yet. */
  | { readonly kind: "started"; readonly merge: UpdateMerge }
  /** One side is ahead of the other, so no choosing is needed: Get updates does it. */
  | { readonly kind: "not-needed" };

/** The history of one open workspace, as the app provides it. */
export interface ChangesSource {
  /** Reads what changed since the last version. Throws when git answers with an error. */
  readonly read: () => Promise<ChangesRead>;
  /** Reads one changed file's text in the last version and now. Throws when it can't be read as text. */
  readonly readTexts: (change: VcsChange) => Promise<FileTexts>;
  /**
   * Replaces a file's text, only while it still holds `expected` (`null` for a file that isn't
   * there); otherwise nothing is written and the answer is `"changed-on-disk"`.
   */
  readonly replaceFile: (
    path: string,
    text: string,
    expected: string | null,
  ) => Promise<ReplaceResult>;
  /**
   * Deletes a file, only while it still holds `expected`; otherwise nothing is removed and the
   * answer is `"changed-on-disk"`.
   */
  readonly removeFile: (path: string, expected: string) => Promise<ReplaceResult>;
  /**
   * Keeps a copy of what a discard is about to throw away, where Halonic's own data lives
   * (`.studio/`), so it stays out of the history. Throws when the copy can't be kept.
   */
  readonly keepCopy: (files: readonly KeptFile[]) => Promise<void>;
  /**
   * Reads the newest `limit` versions that touch the workspace folder, newest first. A folder
   * without history or without a version gives none. Throws when git answers with an error.
   */
  readonly readHistory: (limit: number) => Promise<readonly Version[]>;
  /** Records a version of exactly `paths`; other files stay as changes. Throws when git refuses. */
  readonly createVersion: (input: VersionInput) => Promise<void>;
  /**
   * Who versions of this workspace are from, as git would write it (this workspace's own setting,
   * else the person's own on this computer). A part that isn't set is an empty text.
   */
  readonly readIdentity: () => Promise<Identity>;
  /**
   * Sets who versions of this workspace are from, in this workspace's own history settings.
   * Throws, with a reason a person can read, when git refuses.
   */
  readonly setIdentity: (identity: Identity) => Promise<void>;
  /**
   * Turns the folder into a repository and keeps `.studio/` out of it (`.gitignore`),
   * so Halonic can save versions of it.
   */
  readonly turnOnHistory: () => Promise<void>;
  /** Whether the folder has a place to share to and get updates from. `false` for a folder with no history. */
  readonly hasRemote: () => Promise<boolean>;
  /**
   * Makes `address` (a git address that passed `isShareAddress`) the place to share to and get
   * updates from. Throws, with a reason a person can read, when git refuses it.
   */
  readonly addRemote: (address: string) => Promise<void>;
  /**
   * Brings in the shared copy's newer versions, only when this workspace has none the shared copy
   * lacks (a fast-forward). Changes nothing otherwise. Throws, with a reason a person can read,
   * when the shared copy can't be reached or git refuses.
   */
  readonly getUpdates: () => Promise<UpdatesResult>;
  /**
   * Starts combining the shared copy's versions with this workspace's, for when both have new
   * ones. Everything the shared copy changed and this workspace didn't comes in at once; the
   * items both changed wait for {@link chooseUpdate}. No file ever holds conflict markers.
   * Throws, with a reason a person can read, when the shared copy can't be reached, git refuses,
   * or a file the shared copy changed also has changes not in a version here; nothing changes then.
   */
  readonly startMerge: () => Promise<MergeStart>;
  /** The merge that is started and not finished, as the person left it; `null` when none is. */
  readonly readMerge: () => Promise<UpdateMerge | null>;
  /**
   * Settles one item of the started merge. `both` keeps this side's text where it is and saves
   * the shared copy's next to it as `name (label).ext`; it needs the item to exist on both
   * sides. Throws when the item is not one of the merge's, is already chosen, or its file
   * changed since the merge read it.
   */
  readonly chooseUpdate: (path: string, choice: UpdateChoice, label: string) => Promise<void>;
  /** Takes a choice back, leaving the item as it was before the person chose. */
  readonly undoUpdateChoice: (path: string) => Promise<void>;
  /**
   * Completes the started merge as one version with `message`, once every item is chosen.
   * Throws when one isn't, or git refuses.
   */
  readonly finishMerge: (message: string) => Promise<void>;
  /** Drops the started merge and puts every file back as it was before it; changes not in a version stay. */
  readonly cancelMerge: () => Promise<void>;
  /** Calls `listener` when the window comes to the front or a save may have changed a file; returns a function that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
}

/** The open workspace's history. The app provides it for each open workspace. */
export const ChangesSourceService: ServiceKey<ChangesSource> =
  serviceKey<ChangesSource>("source-control.source");

/**
 * Whether the developer view is on (Settings → Developer → Show files and branches). The
 * Changes page shows per-file Discard and "Discard this part" only while it is. Where no one
 * provides it, the view is off.
 */
export interface DeveloperView {
  /** Whether the developer view is on now. */
  readonly enabled: () => boolean;
  /** Calls `listener` when it is turned on or off; returns a function that stops the calls. */
  readonly subscribe: (listener: () => void) => () => void;
}

/** The window's developer view, when the app provides one. */
export const DeveloperViewService: ServiceKey<DeveloperView> = serviceKey<DeveloperView>(
  "source-control.developer-view",
);
