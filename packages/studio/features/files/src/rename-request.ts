/**
 * A file's tab asking the tree to rename it. The tab and the tree are separate views, so the ask
 * waits here until the tree takes it: the tree may not be on screen yet.
 */
let asked: string | undefined;
const listeners = new Set<() => void>();

/** Asks for the file's name to be edited in its tree row. */
export function askRename(path: string): void {
  asked = path;
  for (const listener of [...listeners]) listener();
}

/** The file a rename was asked for, once: the ask is cleared as it is read. */
export function takeRenameAsked(): string | undefined {
  const path = asked;
  asked = undefined;
  return path;
}

/** Calls `listener` when a rename is asked for. Returns the way to stop. */
export function subscribeRenameAsked(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
