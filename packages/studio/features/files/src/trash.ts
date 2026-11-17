/** What a tab needs to say its file went to the trash: the way to put it back. */
export interface Trashed {
  /** Puts the file back, and says why when it can't. Resolves to whether the file is back. */
  undo(): Promise<boolean>;
}

const trashed = new Map<string, Trashed>();
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of [...listeners]) listener();
}

/** Notes that a file went to the trash, so its open tab can say so and offer Undo. */
export function markTrashed(path: string, entry: Trashed): void {
  trashed.set(path, entry);
  changed();
}

/** Forgets a file's trash entry, when it is back or the delete can no longer be undone. */
export function clearTrashed(path: string): void {
  if (trashed.delete(path)) changed();
}

/** The trash entry of a file deleted in this window, if it is still in the trash. */
export function trashedFile(path: string): Trashed | undefined {
  return trashed.get(path);
}

/** Calls `listener` when a file goes to the trash or comes back. Returns the way to stop. */
export function subscribeTrashed(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
