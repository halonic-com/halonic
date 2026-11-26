import type { Inbox } from "./inbox.ts";

/**
 * The item the Inbox's page shows, by key, for its window to keep (`inbox.window-item`).
 *
 * @example
 * inbox.shownItem.watch((item) => keep({ item }));
 */
export class ShownItem {
  #key: string | undefined;
  readonly #watchers = new Set<(key: string | undefined) => void>();

  /** The key of the item the page shows, or `undefined` for none. */
  get key(): string | undefined {
    return this.#key;
  }

  /** Notes the item the page shows now; watchers hear only a change. */
  note(key: string | undefined): void {
    if (key === this.#key) return;
    this.#key = key;
    for (const watcher of [...this.#watchers]) watcher(key);
  }

  /** Calls `watcher` with each item the page shows from now on. Returns the way to stop. */
  watch(watcher: (key: string | undefined) => void): () => void {
    this.#watchers.add(watcher);
    return () => this.#watchers.delete(watcher);
  }
}

/**
 * Opens the item with `key` again as the Inbox's window reopens (`inbox.window-item`), once the
 * list has loaded and only while the item is still in it, through {@link Inbox.requestOpen}.
 * Resolves whether it asked; an item that is gone, or a list that fails to load, leaves the list
 * showing. Once `signal` aborts, it stops listening and resolves `false` without asking.
 */
export function reopenItem(inbox: Inbox, key: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let stop = (): void => {};
    let done = false;
    const giveUp = (): void => {
      if (done) return;
      done = true;
      stop();
      resolve(false);
    };
    if (signal?.aborted) return giveUp();
    signal?.addEventListener("abort", giveUp, { once: true });
    // `requestOpen` calls the Inbox's listeners, this one too, so it settles only once.
    const settle = (): void => {
      const { loaded, error, items } = inbox.state;
      if (done || (!loaded && error === undefined)) return;
      done = true;
      stop();
      signal?.removeEventListener("abort", giveUp);
      const listed = items.some((item) => item.key === key);
      if (listed) inbox.requestOpen(key);
      resolve(listed);
    };
    settle();
    if (!done) stop = inbox.subscribe(settle);
  });
}
