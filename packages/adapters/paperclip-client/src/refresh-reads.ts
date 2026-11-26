import type { Conversation, InboxItem, MessagingAgent, WorkItem } from "@halonicjs/ports";

/** The lists one `refresh` read, which the list reads right after it answer from. */
export interface RefreshLists {
  /** Only when that `refresh` read the agents, which it does while it knows none. */
  readonly agents?: readonly MessagingAgent[];
  readonly conversations: readonly Conversation[];
  readonly inboxItems: readonly InboxItem[];
  readonly work: readonly WorkItem[];
  readonly channels: readonly Conversation[];
}

/** The name of one list a `refresh` keeps. */
export type RefreshListName = keyof RefreshLists;

/**
 * How long after a `refresh` its lists may still answer a list read. The server's poll loop reads
 * the lists as soon as its `refresh` ends; a read made later than this reads Paperclip again.
 */
export const refreshListsKeepMs = 10_000;

/** One `refresh` in progress: it keeps what it read when it ends. */
export interface RefreshReading {
  /** Keeps `lists`, unless a write or a later `refresh` started since this one began. */
  keep(lists: RefreshLists): void;
}

/**
 * What the last `refresh` read, for the list reads of the same poll
 * (`paperclip-client.refresh-reads`). Each list answers from it once, within
 * {@link refreshListsKeepMs}; a write forgets it, so a read after a write
 * always reads Paperclip again.
 */
export class RefreshReads {
  readonly #now: () => Date;
  #lists: RefreshLists | undefined;
  #keptAt = 0;
  #taken = new Set<RefreshListName>();
  /** Moves on each write and each `refresh`, so a `refresh` that began before one keeps nothing. */
  #generation = 0;

  constructor(now: () => Date) {
    this.#now = now;
  }

  /** Starts a `refresh`: the lists kept before are forgotten. */
  start(): RefreshReading {
    this.forget();
    const generation = this.#generation;
    return {
      keep: (lists) => {
        if (generation !== this.#generation) {
          return;
        }
        this.#lists = lists;
        this.#keptAt = this.#now().getTime();
      },
    };
  }

  /** Forgets the kept lists, and what a `refresh` in progress would keep; called on every write. */
  forget(): void {
    this.#generation += 1;
    this.#lists = undefined;
    this.#taken = new Set();
  }

  /**
   * List `name` as the last `refresh` read it, once; `undefined` when it was taken already, is
   * too old, or that `refresh` didn't read it.
   */
  take<Name extends RefreshListName>(name: Name): RefreshLists[Name] | undefined {
    if (this.#lists === undefined || this.#taken.has(name)) {
      return undefined;
    }
    if (this.#now().getTime() - this.#keptAt > refreshListsKeepMs) {
      this.forget();
      return undefined;
    }
    this.#taken.add(name);
    return this.#lists[name];
  }
}
