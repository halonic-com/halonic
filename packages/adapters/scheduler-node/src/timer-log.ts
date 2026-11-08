import { type Clock, foldRecords, type RecordChange, type RecordStore } from "@halonicjs/ports";
import { fromRecordValues, type StoredTimer, timerSlot, toRecordValues } from "./stored-timer.ts";

/**
 * The scheduler's timers as records in a {@link RecordStore} collection, one
 * record per key and timer id. The store keeps a log of changes, so loading
 * folds the log into the current timers and then compacts it.
 */
export class TimerLog {
  readonly #store: RecordStore;
  readonly #collection: string;
  readonly #clock: Clock;

  constructor(store: RecordStore, collection: string, clock: Clock) {
    this.#store = store;
    this.#collection = collection;
    this.#clock = clock;
  }

  /**
   * The timers the log holds now, by {@link timerSlot}. The log is compacted,
   * so delivered, cancelled and replaced timers leave the store. Compacting
   * is best effort: when the store fails it, the timers read are still
   * returned. A log with a record that isn't a timer is left as it is.
   *
   * @throws Error naming the record when a record isn't a timer this scheduler wrote
   */
  async load(): Promise<Map<string, StoredTimer>> {
    const records = foldRecords(await this.#store.changes(this.#collection));
    const timers = new Map<string, StoredTimer>();
    for (const [recordId, { values }] of records) {
      const stored = fromRecordValues(recordId, values);
      timers.set(timerSlot(stored.timer.key, stored.timer.timerId), stored);
    }
    await this.#compact();
    return timers;
  }

  /** Compacts the log. A failure is not passed on: the timers are already read. */
  async #compact(): Promise<void> {
    try {
      await this.#store.compact(this.#collection);
    } catch {
      // The store is left for the next start to compact.
    }
  }

  /** Records a timer that is new (`isNew`) or replaces the one with the same key and id. */
  async put(stored: StoredTimer, isNew: boolean): Promise<void> {
    await this.#append(
      isNew ? "add" : "update",
      timerSlot(stored.timer.key, stored.timer.timerId),
      toRecordValues(stored),
    );
  }

  /** Records that a timer is gone. */
  async remove(key: string, timerId: string): Promise<void> {
    await this.#append("remove", timerSlot(key, timerId), null);
  }

  async #append(
    op: RecordChange["op"],
    id: string,
    values: Record<string, unknown> | null,
  ): Promise<void> {
    const at = this.#clock.now().toISOString();
    await this.#store.append([{ at, collection: this.#collection, id, op, values }]);
  }
}
