/**
 * A file asking a tree to rename it. The file and the tree are separate views, so the ask waits
 * until the tree takes it: the tree may not be on screen yet. The window has one queue, for a
 * file's tab and the sidebar's tree; Code's page keeps its own, so its pane's Rename reaches its
 * own list column and a file tab's Rename never lands in a Code page behind (`files.code-page`).
 */
export interface RenameAsks {
  /** Asks for the file's name to be edited in its tree row. */
  ask(path: string): void;
  /** The file a rename was asked for, once: the ask is cleared as it is read. */
  take(): string | undefined;
  /** Calls `listener` when a rename is asked for. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

/** A queue of rename asks with nothing waiting. */
export function renameAsks(): RenameAsks {
  let asked: string | undefined;
  const listeners = new Set<() => void>();
  return {
    ask: (path) => {
      asked = path;
      for (const listener of [...listeners]) listener();
    },
    take: () => {
      const path = asked;
      asked = undefined;
      return path;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** The window's queue: a file tab's Rename, which the sidebar's tree takes. */
export const windowRenameAsks: RenameAsks = renameAsks();

/** Asks the sidebar's tree for the file's name to be edited in its row. */
export function askRename(path: string): void {
  windowRenameAsks.ask(path);
}

/** The file a rename was asked for in the window, once: the ask is cleared as it is read. */
export function takeRenameAsked(): string | undefined {
  return windowRenameAsks.take();
}

/** Calls `listener` when a rename is asked for in the window. Returns the way to stop. */
export function subscribeRenameAsked(listener: () => void): () => void {
  return windowRenameAsks.subscribe(listener);
}
