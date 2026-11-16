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
   * Turns the folder into a repository and keeps `.studio/` out of it (`.gitignore`),
   * so Halonic can save versions of it.
   */
  readonly turnOnHistory: () => Promise<void>;
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
