import type { MessagingId } from "@halonicjs/ports";

/**
 * The chat the Messenger's page shows, for its window to keep, and a chat asked to show again
 * when the window reopens (`messenger.window-chat`). The page notes each change and takes each
 * ask, now or when it shows. Once the page opens a chat itself, from a hand-over or a row the
 * person picked, it drops the ask and every later one, so a kept chat never replaces it.
 *
 * @example
 * messenger.shown.watch((chat) => keep({ chat }));
 * await messenger.reopen("chat-1"); // asks only while the chat is still listed
 */
export class ShownChat {
  #id: MessagingId | undefined;
  #asked: MessagingId | undefined;
  #chosen = false;
  readonly #watchers = new Set<(id: MessagingId | undefined) => void>();
  readonly #askWatchers = new Set<() => void>();

  /** The chat the page shows, or `undefined` for none. */
  get id(): MessagingId | undefined {
    return this.#id;
  }

  /** Notes the chat the page shows now; watchers hear only a change. */
  note(id: MessagingId | undefined): void {
    if (id === this.#id) return;
    this.#id = id;
    for (const watcher of [...this.#watchers]) watcher(id);
  }

  /** Calls `watcher` with each chat the page shows from now on. Returns the way to stop. */
  watch(watcher: (id: MessagingId | undefined) => void): () => void {
    this.#watchers.add(watcher);
    return () => this.#watchers.delete(watcher);
  }

  /** Asks the page to show the chat `id`. Returns whether it asked: not once the page chose. */
  ask(id: MessagingId): boolean {
    if (this.#chosen) return false;
    this.#asked = id;
    for (const watcher of [...this.#askWatchers]) watcher();
    return true;
  }

  /**
   * Notes that the page opened a chat itself, from a hand-over or a row the person picked. It drops
   * the ask not yet taken and every later one.
   */
  choose(): void {
    this.#chosen = true;
    this.#asked = undefined;
  }

  /** The chat the page was asked to show, once: the ask is cleared as it's taken. */
  take(): MessagingId | undefined {
    const asked = this.#asked;
    this.#asked = undefined;
    return asked;
  }

  /** Calls `watcher` after each {@link ask}. Returns the way to stop. */
  onAsked(watcher: () => void): () => void {
    this.#askWatchers.add(watcher);
    return () => this.#askWatchers.delete(watcher);
  }
}
