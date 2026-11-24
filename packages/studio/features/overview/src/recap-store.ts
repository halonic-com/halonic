import type { AgentMessaging } from "@halonicjs/ports";
import { buildRecap, type Recap } from "./recap.ts";

/** Where the recap's read stands. */
export type RecapState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly recap: Recap }
  | { readonly kind: "failed"; readonly error: unknown };

/** Remembers when the person last opened the recap, as ISO text. */
export interface RecapMark {
  read(): string | undefined;
  write(openedAt: string): void;
}

/** A {@link RecapMark} kept in memory, for tests and when no storage is at hand. */
export function memoryRecapMark(openedAt?: string): RecapMark {
  let mark = openedAt;
  return {
    read: () => mark,
    write: (next) => {
      mark = next;
    },
  };
}

const markKey = "halonic.overview.recap-opened-at";

/** A {@link RecapMark} kept in Web storage, so it outlives a restart of Studio. */
export function storageRecapMark(storage: Storage): RecapMark {
  return {
    read: () => storage.getItem(markKey) ?? undefined,
    write: (openedAt) => storage.setItem(markKey, openedAt),
  };
}

/**
 * Builds the recap when the person opens it, then marks it opened, so the
 * next Studio session's recap covers only what changed after this one.
 * The store reads the mark once, at its first opening: opening it again
 * (a remount, React's StrictMode, coming back to the screen) rebuilds the
 * recap from that same mark, so the person never loses what changed.
 */
export class RecapStore {
  private state: RecapState = { kind: "loading" };
  private readonly listeners = new Set<() => void>();

  private readonly messaging: AgentMessaging;
  private readonly mark: RecapMark;
  private readonly now: () => Date;
  /** The mark this store's recaps count from, read at the first opening. */
  private since: { readonly openedAt: string | undefined } | undefined;

  constructor(messaging: AgentMessaging, mark: RecapMark, now: () => Date = () => new Date()) {
    this.messaging = messaging;
    this.mark = mark;
    this.now = now;
  }

  /** The latest state, for `useSyncExternalStore`. */
  readonly snapshot = (): RecapState => this.state;

  /** Calls `listener` after each new state; returns the call that stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads inbox items and work, builds the recap since the last one, and marks this one opened. */
  async open(): Promise<void> {
    this.since ??= { openedAt: this.mark.read() };
    const since = this.since.openedAt;
    try {
      const [items, work] = await Promise.all([
        this.messaging.listInboxItems(),
        this.messaging.listWork(),
      ]);
      const now = this.now();
      const recap = buildRecap({ items, work, since, now });
      this.mark.write(now.toISOString());
      this.set({ kind: "ready", recap });
    } catch (error) {
      this.set({ kind: "failed", error });
    }
  }

  private set(state: RecapState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
