import type { RunEvent, RunEventBody } from "@halonicjs/events";
import type { Clock, RunStore } from "@halonicjs/ports";
import type { HarnessEventLog } from "./run-harness-call.ts";

/**
 * A {@link HarnessEventLog} that appends to a run's log in a {@link RunStore},
 * one event at a time in the order they were given. A harness call writes
 * from two places at once, the harness's stream and the bridge, so each
 * append waits for the one before it. The store accepts an event only if
 * the log hasn't moved on, so no other writer is overwritten.
 */
export class SerialRunLog implements HarnessEventLog {
  readonly #store: Pick<RunStore, "append">;
  readonly #runId: string;
  readonly #clock: Clock;
  #seq: number;
  /** The last append, which the next one waits for. */
  #tail: Promise<void> = Promise.resolve();

  /** @param lastSeq - the `seq` of the run's last stored event, which the first event follows */
  constructor(store: Pick<RunStore, "append">, runId: string, lastSeq: number, clock: Clock) {
    this.#store = store;
    this.#runId = runId;
    this.#seq = lastSeq;
    this.#clock = clock;
  }

  /**
   * Appends one event after every event given before it.
   *
   * @throws when another writer added to the run's log first, or an earlier append failed
   */
  append(event: RunEventBody): Promise<void> {
    const appended = this.#tail.then(() => this.#write(event));
    this.#tail = appended;
    return appended;
  }

  async #write(event: RunEventBody): Promise<void> {
    const stored: RunEvent = {
      ...event,
      runId: this.#runId,
      seq: this.#seq + 1,
      at: this.#clock.now().toISOString(),
    };
    const result = await this.#store.append(this.#runId, this.#seq, [stored]);
    if (!result.ok) {
      throw new Error(
        `The log of run ${this.#runId} moved on to event ${result.lastSeq} while a harness wrote to it after event ${this.#seq}.`,
      );
    }
    this.#seq = result.lastSeq;
  }
}
