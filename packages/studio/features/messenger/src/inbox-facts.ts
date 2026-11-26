import type { InboxItem, MessagingId } from "@halonicjs/ports";

/** One Inbox read the rows started: its items once it landed, else the last read's. */
export interface CardsRead {
  /** The items to show now; a read still under way leaves the last read's, or none before the first. */
  now(): readonly InboxItem[];
}

/**
 * The Inbox as the Messenger last read it, for the rows' card facts (requirement
 * `messenger.rows-first`). A source's first Inbox read can read every open task's cards, which takes
 * tens of seconds in a big company (HAL-19822), so the list doesn't wait for it: the rows take the
 * items of the last read that landed, and a read that lands after its rows went out with other
 * items tells {@link onLate}'s listeners, so the list reads again. Everyone who asks while a read
 * is under way shares it, so the rows, Needs you and a channel's questions read the Inbox once.
 */
export class InboxFacts {
  readonly #list: () => Promise<readonly InboxItem[]>;
  readonly #listeners = new Set<(source: MessagingId) => void>();
  #reading: Promise<readonly InboxItem[]> | undefined;
  #last: readonly InboxItem[] | undefined;

  constructor(list: () => Promise<readonly InboxItem[]>) {
    this.#list = list;
  }

  /** Every inbox item, from the read under way or a new one. */
  read(): Promise<readonly InboxItem[]> {
    this.#reading ??= this.#list().then(
      (items) => {
        this.#last = items;
        this.#reading = undefined;
        return items;
      },
      (error: unknown) => {
        this.#reading = undefined;
        throw error;
      },
    );
    return this.#reading;
  }

  /**
   * Starts a read for rows that won't wait for it. A read that fails is logged and costs the rows
   * only their card facts, as a chat whose messages can't be read costs only its preview.
   */
  start(): CardsRead {
    let landed: readonly InboxItem[] | undefined;
    let shown: readonly InboxItem[] | undefined;
    this.read().then(
      (items) => {
        landed = items;
        if (shown !== undefined && !same(shown, items)) this.#tell([...shown, ...items]);
      },
      (error: unknown) => {
        console.error("The Messenger couldn't read the Inbox for its rows:", error);
      },
    );
    return {
      now: () => {
        shown = landed ?? this.#last ?? [];
        return shown;
      },
    };
  }

  /** Calls `listener` with each source whose cards changed after the rows showed them, until stopped. */
  onLate(listener: (source: MessagingId) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #tell(items: readonly InboxItem[]): void {
    const sources = new Set(items.map((item) => item.source));
    for (const listener of this.#listeners) {
      for (const source of sources) listener(source);
    }
  }
}

/** Whether two reads hold the same items, in the same states. */
function same(left: readonly InboxItem[], right: readonly InboxItem[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
