import type { PendingChanges } from "./workspace-files.ts";

/** One file a save wrote or deleted: its store text before and after, `null` for no file. */
export interface SavedFile {
  path: string;
  before: string | null;
  after: string | null;
}

/**
 * Measures unsaved changes against the store after a save instead of before
 * it. A file the snapshot left alone had the old store text, so it now
 * differs by that text; a file whose unsaved text is what was saved no
 * longer differs.
 */
export function rebase(snapshot: PendingChanges, saved: readonly SavedFile[]): PendingChanges {
  const rebased: Record<string, string | null> = { ...snapshot };
  for (const { path, before, after } of saved) {
    if (!Object.hasOwn(rebased, path)) {
      rebased[path] = before;
    }
    if (rebased[path] === after) {
      delete rebased[path];
    }
  }
  return rebased;
}

/** A file a save left alone because it changed outside Halonic. */
export interface HeldFile {
  path: string;
  /** The file's text now, or `null` when it is gone. */
  current: string | null;
}

/**
 * Thrown by a save when a file no longer holds what Halonic last read: it
 * changed outside Halonic. Nothing was written to that file; the changes stay
 * unsaved, so Compare can show both texts (save model 1.7). The save went on
 * with the other files first, so `held` lists every file it left alone.
 */
export class ChangedOnDiskError extends Error {
  /** The first held file. */
  readonly path: string;
  /** The first held file's text now, or `null` when it is gone. */
  readonly current: string | null;
  readonly held: readonly HeldFile[];

  constructor(
    path: string,
    current: string | null,
    held: readonly HeldFile[] = [{ path, current }],
  ) {
    super(`"${path}" changed outside Halonic, so it was not saved.`);
    this.name = "ChangedOnDiskError";
    this.path = path;
    this.current = current;
    this.held = held;
  }
}
