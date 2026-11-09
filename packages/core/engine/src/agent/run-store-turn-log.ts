import type { RunEvent } from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";
import type { TurnEvent, TurnLog } from "./turn-log.ts";

/**
 * A {@link TurnLog} that appends to a run's log in a {@link RunStore}. It
 * numbers each event after the last one it wrote and stamps it with the
 * clock's time. The store accepts an event only if the log hasn't moved on,
 * so two writers can never both write the same place.
 */
export class RunStoreTurnLog implements TurnLog {
  private readonly store: Pick<RunStore, "append">;
  private readonly runId: string;
  private readonly clock: Clock;
  private seq: number;

  /**
   * @param lastSeq - the `seq` of the run's last stored event, which the turn's first event follows
   */
  constructor(store: Pick<RunStore, "append">, runId: string, lastSeq: number, clock: Clock) {
    this.store = store;
    this.runId = runId;
    this.seq = lastSeq;
    this.clock = clock;
  }

  /** The `seq` of the last event in the log as this writer knows it, to go on writing after the turn. */
  get lastSeq(): number {
    return this.seq;
  }

  /**
   * Appends one event after the last one this writer wrote.
   *
   * @throws when another writer added to the run's log first; the turn stops there
   */
  async append(event: TurnEvent): Promise<void> {
    const stored: RunEvent = {
      ...event,
      runId: this.runId,
      seq: this.seq + 1,
      at: this.clock.now().toISOString(),
    };
    const result = await this.store.append(this.runId, this.seq, [stored]);
    if (!result.ok) {
      throw new Error(
        `The log of run ${this.runId} moved on to event ${result.lastSeq} while a model turn wrote to it after event ${this.seq}.`,
      );
    }
    this.seq = result.lastSeq;
  }
}
