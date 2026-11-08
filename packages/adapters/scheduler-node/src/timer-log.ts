import type { Clock, RecordChange, RecordStore } from "@halonicjs/ports";
import { fromRecordValues, type StoredTimer, timerSlot, toRecordValues } from "./stored-timer.ts";

/**
 * The scheduler's timers as records in a {@link RecordStore} collection, one
 * record per key and timer id. The store keeps a log of changes, so loading
 * folds the log into the current timers.
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
   * The timers the log holds now, by {@link timerSlot}.
   *
   * @throws Error naming the record when a record isn't a timer this scheduler wrote
   */
  async load(): Promise<Map<string, StoredTimer>> {
    const records = new Map<string, Record<string, unknown>>();
    for (const change of await this.#store.changes(this.#collection)) {
      applyChange(records, change);
    }
    const timers = new Map<string, StoredTimer>();
    for (const [recordId, values] of records) {
      const stored = fromRecordValues(recordId, values);
      timers.set(timerSlot(stored.timer.key, stored.timer.timerId), stored);
    }
    return timers;
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

/** Folds one change into the current records, as the {@link RecordChange} rules say. */
function applyChange(records: Map<string, Record<string, unknown>>, change: RecordChange): void {
  if (change.op === "remove") {
    records.delete(change.id);
    return;
  }
  const values = change.values ?? {};
  if (change.op === "update") {
    records.set(change.id, { ...records.get(change.id), ...values });
    return;
  }
  records.set(change.id, { ...values });
}
