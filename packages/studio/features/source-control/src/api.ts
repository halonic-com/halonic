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
  | { readonly kind: "no-git" };

/** One changed file's text in the last version and now. `null` is a file that isn't there. */
export interface FileTexts {
  readonly before: string | null;
  readonly after: string | null;
}

/** What {@link ChangesSource.replaceFile} did. */
export type ReplaceResult = "replaced" | "changed-on-disk";

/** The history of one open workspace, as the app provides it. */
export interface ChangesSource {
  /** Reads what changed since the last version. Throws when git answers with an error. */
  readonly read: () => Promise<ChangesRead>;
  /** Reads one changed file's text in the last version and now. Throws when it can't be read as text. */
  readonly readTexts: (change: VcsChange) => Promise<FileTexts>;
  /**
   * Replaces a file's text, only while it still holds `expected`; otherwise nothing is written and
   * the answer is `"changed-on-disk"`.
   */
  readonly replaceFile: (path: string, text: string, expected: string) => Promise<ReplaceResult>;
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
