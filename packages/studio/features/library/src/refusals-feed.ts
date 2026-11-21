import type { ChatTurnRefusal, ChatTurnWaiting } from "@halonicjs/ports";
import type { RecordedRefusal } from "./connector-status-host.ts";
import { refusalLimit } from "./connector-status-model.ts";

/**
 * What the engine refused since Halonic started, kept in memory: the last {@link refusalLimit}
 * for each connector, newest first. The app gives {@link RefusalsFeed.record} to the chat
 * service as its `onRefusals` and reads {@link RefusalsFeed.refusals} and
 * {@link RefusalsFeed.subscribe} for its `ConnectorStatusHost`.
 *
 * It also keeps which listed tools wait for approval, as the last chat turn left them out: unlike
 * refusals, that is the current set, not a history. The app gives {@link RefusalsFeed.recordWaiting}
 * to the chat service as its `onWaiting`, and {@link RefusalsFeed.recordWaitingOf} to a run's
 * `reportWaiting`.
 *
 * Only refusals that come with a chat turn are kept. A refusal outside a chat (a call a
 * routine makes) is not in a turn's answer, so it is not here.
 */
export class RefusalsFeed {
  private readonly bySource = new Map<string, RecordedRefusal[]>();
  private waitingNow: readonly ChatTurnWaiting[] = [];
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

  /**
   * Replaces what waits for approval with what the last chat turn left out; an empty list
   * clears it. Calls the watchers only when the set changed, since a turn reports it every time.
   */
  recordWaiting = (waiting: readonly ChatTurnWaiting[]): void => {
    const same =
      waiting.length === this.waitingNow.length &&
      waiting.every(
        (tool, index) =>
          tool.source === this.waitingNow[index]?.source &&
          tool.name === this.waitingNow[index]?.name,
      );
    if (same) return;
    this.waitingNow = waiting;
    for (const listener of [...this.listeners]) listener();
  };

  /**
   * Replaces what waits for approval of one connector only, as a run's turn reports it for each
   * connector that leaves tools out; the other connectors' waiting tools stay.
   */
  recordWaitingOf = (connectorId: string, waiting: readonly ChatTurnWaiting[]): void => {
    const now = this.waiting(connectorId);
    const own = waiting.filter((tool) => tool.source === connectorId);
    const same =
      own.length === now.length && own.every((tool, index) => tool.name === now[index]?.name);
    if (same) return;
    this.recordWaiting([...this.waitingNow.filter((tool) => tool.source !== connectorId), ...own]);
  };

  /** The listed tools of one connector that wait for approval, in the order the turn left them out. */
  waiting(connectorId: string): readonly ChatTurnWaiting[] {
    return this.waitingNow.filter((tool) => tool.source === connectorId);
  }

  /** One connector's refusals, newest first. */
  refusals(connectorId: string): readonly RecordedRefusal[] {
    return this.bySource.get(connectorId) ?? [];
  }

  /** Calls `listener` after each {@link record} that kept something and each {@link recordWaiting} that changed the set; returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
