import type { PendingChanges } from "./workspace-files.ts";

/** Thrown when a rename can't be done: nothing was changed. */
export class RenameRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenameRefusedError";
  }
}

/** What {@link planRename} needs to know about the two paths. */
export interface RenameFacts {
  from: string;
  to: string;
  /** The unsaved changes now. */
  changes: PendingChanges;
  /** The file's text with the unsaved changes applied, `null` when there is none. */
  fromText: string | null;
  /** Whether the store holds a file at `from`. */
  fromSaved: boolean;
  /** Whether the store holds a file at `to`. */
  toSaved: boolean;
  /** New text for other files that name the old path, by path; one for `from` goes to `to`. */
  rewrites: Readonly<Record<string, string>>;
}

/**
 * The unsaved changes after a rename: the text moves to the new path, the old
 * path is marked for deletion, and the rewrites are applied. The new file comes
 * first, so a save that stops halfway never loses the text.
 *
 * @throws RenameRefusedError when the old file isn't there or is deleted, or the new path is taken
 */
export function planRename(facts: RenameFacts): PendingChanges {
  const { from, to, changes, fromText, fromSaved, toSaved, rewrites } = facts;
  if (from === to) {
    throw new RenameRefusedError(`"${from}" already has that name.`);
  }
  if (changes[from] === null) {
    throw new RenameRefusedError(`"${from}" is deleted, so it can't be renamed.`);
  }
  if (fromText === null) {
    throw new RenameRefusedError(`"${from}" doesn't exist.`);
  }
  // A pending delete of the target doesn't free it: its file is still in the store.
  if (toSaved || typeof changes[to] === "string") {
    throw new RenameRefusedError(`"${to}" already exists.`);
  }
  const next: Record<string, string | null> = { [to]: rewrites[from] ?? fromText };
  for (const [path, text] of Object.entries(changes)) {
    if (path !== from && path !== to) next[path] = text;
  }
  for (const [path, text] of Object.entries(rewrites)) {
    if (path !== from) next[path] = text;
  }
  // A file that was only ever unsaved has nothing in the store to delete.
  if (fromSaved) next[from] = null;
  return next;
}
