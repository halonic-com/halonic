import type { Clock, RecordChange, RecordStore } from "@halonicjs/ports";

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
 * the log into the current state.
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
   * The state the log holds now.
   *
   * @throws Error naming the record when a record isn't one this adapter wrote
   */
  async load(): Promise<CoordinationState> {
    const records = new Map<string, Record<string, unknown>>();
    for (const change of await this.#store.changes(this.#collection)) {
      applyChange(records, change);
    }
    const state: CoordinationState = {
      leases: new Map(),
      values: new Map(),
      counters: new Map(),
      windows: new Map(),
    };
    for (const [recordId, values] of records) {
      addEntry(state, readEntry(recordId, values));
    }
    return state;
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

  async #append(
    op: RecordChange["op"],
    id: string,
    values: Record<string, unknown> | null,
  ): Promise<void> {
    const at = this.#clock.now().toISOString();
    await this.#store.append([{ at, collection: this.#collection, id, op, values }]);
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
