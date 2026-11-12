import type { ChatTurnRefusal } from "@halonicjs/ports";
import type { RecordedRefusal } from "./connector-status-host.ts";
import { refusalLimit } from "./connector-status-model.ts";

/**
 * What the engine refused since Halonic started, kept in memory: the last {@link refusalLimit}
 * for each connector, newest first. The app gives {@link RefusalsFeed.record} to the chat
 * service as its `onRefusals` and reads {@link RefusalsFeed.refusals} and
 * {@link RefusalsFeed.subscribe} for its `ConnectorStatusHost`.
 *
 * Only refusals that come with a chat turn are kept. A refusal outside a chat (a call a
 * routine makes) is not in a turn's answer, so it is not here.
 */
export class RefusalsFeed {
  private readonly bySource = new Map<string, RecordedRefusal[]>();
  private readonly listeners = new Set<() => void>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /** Keeps the refusals of one chat turn, stamped with the time they arrived. Does nothing for an empty list. */
  record = (refusals: readonly ChatTurnRefusal[]): void => {
    if (refusals.length === 0) return;
    const at = this.now();
    for (const refusal of refusals) {
      const kept = this.bySource.get(refusal.source) ?? [];
      this.bySource.set(refusal.source, [{ refusal, at }, ...kept].slice(0, refusalLimit));
    }
    for (const listener of [...this.listeners]) listener();
  };

  /** One connector's refusals, newest first. */
  refusals(connectorId: string): readonly RecordedRefusal[] {
    return this.bySource.get(connectorId) ?? [];
  }

  /** Calls `listener` after each {@link record} that kept something; returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
