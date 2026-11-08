import { type Clock, foldRecords, type RecordChange, type RecordStore } from "@halonicjs/ports";

/** A lease as it is kept: who holds it and until when, in ms. */
export interface HeldLease {
  readonly token: string;
  readonly expiresAt: number;
}

/** A fixed window: when it started, in ms, and the attempts counted in it. */
export interface CountWindow {
  readonly start: number;
  readonly count: number;
}

/** Everything the coordination adapter keeps. Each kind has its own keys. */
export interface CoordinationState {
  readonly leases: Map<string, HeldLease>;
  readonly values: Map<string, string>;
  readonly counters: Map<string, number>;
  readonly windows: Map<string, CountWindow>;
}

/** What one record holds; `kind` says which map of {@link CoordinationState} it belongs to. */
export type StateEntry =
  | { kind: "lease"; key: string; lease: HeldLease }
  | { kind: "value"; key: string; value: string }
  | { kind: "counter"; key: string; value: number }
  | { kind: "window"; key: string; window: CountWindow };

/**
 * The coordination state as records in a {@link RecordStore} collection, one
 * record per kind and key. The store keeps a log of changes, so loading folds
 * the log into the current state and then compacts it.
 */
export class StateLog {
  readonly #store: RecordStore;
  readonly #collection: string;
  readonly #clock: Clock;

  constructor(store: RecordStore, collection: string, clock: Clock) {
    this.#store = store;
    this.#collection = collection;
    this.#clock = clock;
  }

  /**
   * The state the log holds now. Leases that have run out are removed, and
   * the log is compacted, so only the current entries stay in the store.
   * That clean-up is best effort: when the store fails it, the state read is
   * still returned. A log with a record this adapter didn't write is left as
   * it is.
   *
   * @throws Error naming the record when a record isn't one this adapter wrote
   */
  async load(): Promise<CoordinationState> {
    const records = foldRecords(await this.#store.changes(this.#collection));
    const state: CoordinationState = {
      leases: new Map(),
      values: new Map(),
      counters: new Map(),
      windows: new Map(),
    };
    for (const [recordId, { values }] of records) {
      addEntry(state, readEntry(recordId, values));
    }
    await this.#cleanUp(state);
    return state;
  }

  /**
   * Removes the leases that have run out and compacts the log. A failure is
   * not passed on: the state is already read, and a lease that has run out
   * is not held whether or not its record is removed.
   */
  async #cleanUp(state: CoordinationState): Promise<void> {
    try {
      await this.#removeLeasesRunOut(state);
      await this.#store.compact(this.#collection);
    } catch {
      // The store is left for the next start to clean up.
    }
  }

  /**
   * Records an entry that is new (`isNew`) or replaces the one of the same
   * kind and key. Like the scheduler's timer log, a new entry is an `add` and
   * a replacement an `update`; both carry all the values.
   */
  async put(entry: StateEntry, isNew: boolean): Promise<void> {
    await this.#append(
      isNew ? "add" : "update",
      recordId(entry.kind, entry.key),
      toRecordValues(entry),
    );
  }

  /** Records that the entry of this kind and key is gone. */
  async remove(kind: StateEntry["kind"], key: string): Promise<void> {
    await this.#append("remove", recordId(kind, key), null);
  }

  /**
   * Removes the leases that ran out before now. Nobody holds them any more,
   * so dropping them changes no answer; a window can't be judged the same
   * way, because only the caller knows how long it is.
   */
  async #removeLeasesRunOut(state: CoordinationState): Promise<void> {
    const now = this.#clock.now().getTime();
    const runOut = [...state.leases]
      .filter(([, lease]) => lease.expiresAt <= now)
      .map(([key]) => key);
    if (runOut.length === 0) return;
    await this.#store.append(
      runOut.map((key) => this.#change("remove", recordId("lease", key), null)),
    );
    for (const key of runOut) state.leases.delete(key);
  }

  async #append(
    op: RecordChange["op"],
    id: string,
    values: Record<string, unknown> | null,
  ): Promise<void> {
    await this.#store.append([this.#change(op, id, values)]);
  }

  #change(
    op: RecordChange["op"],
    id: string,
    values: Record<string, unknown> | null,
  ): RecordChange {
    const at = this.#clock.now().toISOString();
    return { at, collection: this.#collection, id, op, values };
  }
}

/** Puts a loaded entry into its map. */
export function addEntry(state: CoordinationState, entry: StateEntry): void {
  if (entry.kind === "lease") state.leases.set(entry.key, entry.lease);
  if (entry.kind === "value") state.values.set(entry.key, entry.value);
  if (entry.kind === "counter") state.counters.set(entry.key, entry.value);
  if (entry.kind === "window") state.windows.set(entry.key, entry.window);
}

/** Whether the state holds an entry of this kind and key. */
export function hasEntry(state: CoordinationState, kind: StateEntry["kind"], key: string): boolean {
  const maps = {
    lease: state.leases,
    value: state.values,
    counter: state.counters,
    window: state.windows,
  } satisfies Record<StateEntry["kind"], Map<string, unknown>>;
  return maps[kind].has(key);
}

/** One id per kind and key; JSON keeps every key apart, whatever it contains. */
function recordId(kind: StateEntry["kind"], key: string): string {
  return JSON.stringify([kind, key]);
}

function toRecordValues(entry: StateEntry): Record<string, unknown> {
  const iso = (ms: number) => new Date(ms).toISOString();
  switch (entry.kind) {
    case "lease":
      return {
        kind: "lease",
        key: entry.key,
        token: entry.lease.token,
        expiresAt: iso(entry.lease.expiresAt),
      };
    case "window":
      return {
        kind: "window",
        key: entry.key,
        start: iso(entry.window.start),
        count: entry.window.count,
      };
    default:
      return { kind: entry.kind, key: entry.key, value: entry.value };
  }
}

/**
 * Reads an entry back from its record values.
 *
 * @throws Error naming the record when the values aren't an entry this adapter wrote
 */
function readEntry(id: string, values: Record<string, unknown>): StateEntry {
  const { kind, key, value, token, expiresAt, start, count } = values;
  const time = (text: unknown) => (typeof text === "string" ? Date.parse(text) : Number.NaN);
  const isCount = (amount: unknown): amount is number =>
    typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0;
  if (typeof key === "string") {
    if (kind === "lease" && typeof token === "string" && !Number.isNaN(time(expiresAt))) {
      return { kind, key, lease: { token, expiresAt: time(expiresAt) } };
    }
    if (kind === "value" && typeof value === "string") {
      return { kind, key, value };
    }
    if (kind === "counter" && isCount(value)) {
      return { kind, key, value };
    }
    if (kind === "window" && isCount(count) && !Number.isNaN(time(start))) {
      return { kind, key, window: { start: time(start), count } };
    }
  }
  throw new Error(`Coordination record ${id} is not a lease, value, counter or window.`);
}
