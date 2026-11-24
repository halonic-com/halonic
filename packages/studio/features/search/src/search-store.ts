import type { AgentMessaging } from "@halonicjs/ports";
import { groupHits, type SearchKindGroup } from "./search-results.ts";

/** Where a search stands. An empty query is `idle`: nothing was asked. */
export type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "searching"; readonly query: string }
  | { readonly kind: "ready"; readonly query: string; readonly groups: readonly SearchKindGroup[] }
  | { readonly kind: "failed"; readonly query: string; readonly error: unknown };

/**
 * Searches `AgentMessaging` for what the person types and keeps the hits
 * grouped by kind and source (requirement `search.across-sources`). A query
 * of only spaces asks nothing. A later query wins over an earlier one still
 * running.
 */
export class SearchStore {
  private state: SearchState = { kind: "idle" };
  private readonly listeners = new Set<() => void>();
  private searches = 0;

  private readonly messaging: AgentMessaging;

  constructor(messaging: AgentMessaging) {
    this.messaging = messaging;
  }

  /** The latest state, for `useSyncExternalStore`. */
  readonly snapshot = (): SearchState => this.state;

  /** Calls `listener` after each new state; returns the call that stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Searches for `text`; an empty or blank `text` clears the results without a search. */
  async search(text: string): Promise<void> {
    const search = ++this.searches;
    const query = text.trim();
    if (query === "") {
      this.set({ kind: "idle" });
      return;
    }
    this.set({ kind: "searching", query });
    try {
      const [hits, sources] = await Promise.all([
        this.messaging.search(query),
        this.messaging.listSources(),
      ]);
      if (search !== this.searches) return;
      this.set({ kind: "ready", query, groups: groupHits(hits, sources) });
    } catch (error) {
      if (search === this.searches) this.set({ kind: "failed", query, error });
    }
  }

  private set(state: SearchState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
