import type { AgentMessaging } from "@halonicjs/ports";
import { buildOverview, type Overview } from "./overview.ts";

/** Where the overview's read stands. */
export type OverviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly overview: Overview }
  | { readonly kind: "failed"; readonly error: unknown };

/**
 * Keeps the overview read from `AgentMessaging`, and reads it again each
 * time a source says it changed, so the page never polls. `start` begins
 * reading; `stop` ends the reader of `changes`.
 */
export class OverviewStore {
  private state: OverviewState = { kind: "loading" };
  private readonly listeners = new Set<() => void>();
  private changes: AsyncIterator<string> | undefined;
  private reads = 0;

  private readonly messaging: AgentMessaging;

  constructor(messaging: AgentMessaging) {
    this.messaging = messaging;
  }

  /** The latest state, for `useSyncExternalStore`. */
  readonly snapshot = (): OverviewState => this.state;

  /** Calls `listener` after each new state; returns the call that stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads now, then again on every change, until {@link stop}. */
  start(): Promise<void> {
    if (this.changes === undefined) {
      this.changes = this.messaging.changes()[Symbol.asyncIterator]();
      void this.follow(this.changes);
    }
    return this.read();
  }

  /** Stops reading on changes. */
  stop(): void {
    const changes = this.changes;
    this.changes = undefined;
    // Ending the reader lets the source drop it; its result tells us nothing.
    void changes?.return?.();
  }

  /** Reads sources, agents and work once. A later read wins over an earlier one still running. */
  async read(): Promise<void> {
    const read = ++this.reads;
    try {
      const [sources, agents, work] = await Promise.all([
        this.messaging.listSources(),
        this.messaging.listAgents(),
        this.messaging.listWork(),
      ]);
      if (read !== this.reads) return;
      this.set({ kind: "ready", overview: buildOverview({ sources, agents, work }) });
    } catch (error) {
      if (read === this.reads) this.set({ kind: "failed", error });
    }
  }

  private async follow(changes: AsyncIterator<string>): Promise<void> {
    try {
      for (let next = await changes.next(); !next.done; next = await changes.next()) {
        if (this.changes !== changes) return;
        await this.read();
      }
    } catch (error) {
      this.set({ kind: "failed", error });
    }
  }

  private set(state: OverviewState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
