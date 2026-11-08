import type {
  Clock,
  Coordination,
  CounterResult,
  Lease,
  RecordStore,
  WindowCount,
} from "@halonicjs/ports";
import { checkAmount, checkKey, checkValue } from "./input-rules.ts";
import {
  addEntry,
  type CoordinationState,
  type HeldLease,
  hasEntry,
  type StateEntry,
  StateLog,
} from "./state-log.ts";

/** The collection the state is kept in when no other is given. */
export const defaultCoordinationCollection = "halonic.coordination";

/** What a {@link NodeCoordination} needs. */
export interface NodeCoordinationOptions {
  /** Where leases, values, counters and windows are kept, so they survive a restart. */
  store: RecordStore;
  /** The collection in `store` that holds the state; one per deployment. */
  collection?: string;
  /** The time; leases and windows run out by this clock. */
  clock: Clock;
  /**
   * Makes a lease token that no earlier holder had, also across restarts, and
   * that nobody can guess; `randomLeaseToken` on a real server.
   */
  newToken: () => string;
}

/**
 * The {@link Coordination} port on Node, for one process. The state lives in
 * memory and in a {@link RecordStore} collection. Every call runs after the
 * one before has finished, and writes its change to the store before memory
 * changes, so every operation is atomic and a restart keeps what a caller was
 * told: a lease stays held until it runs out, and counters and windows go on
 * where they were.
 */
export class NodeCoordination implements Coordination {
  readonly #clock: Clock;
  readonly #log: StateLog;
  readonly #newToken: () => string;
  readonly #loaded: Promise<CoordinationState>;
  /** The end of the queue of calls; each call waits for the one before. */
  #lastCall: Promise<unknown> = Promise.resolve();

  constructor(options: NodeCoordinationOptions) {
    this.#clock = options.clock;
    this.#newToken = options.newToken;
    const collection = options.collection ?? defaultCoordinationCollection;
    this.#log = new StateLog(options.store, collection, this.#clock);
    this.#loaded = this.#log.load();
    // A load failure rejects every call; this keeps it from also being
    // reported as unhandled before the first call.
    this.#loaded.catch(() => undefined);
  }

  async tryAcquire(key: string, ttlMs: number): Promise<Lease | null> {
    checkKey(key);
    checkAmount("ttlMs", ttlMs);
    return this.#inTurn(async (state, now) => {
      if (isHeld(state.leases.get(key), now)) return null;
      const lease = { token: this.#newToken(), expiresAt: now + ttlMs };
      await this.#put(state, { kind: "lease", key, lease });
      return toLease(key, lease);
    });
  }

  async renew(lease: Lease, ttlMs: number): Promise<Lease | null> {
    checkKey(lease.key);
    checkAmount("ttlMs", ttlMs);
    return this.#inTurn(async (state, now) => {
      const held = state.leases.get(lease.key);
      if (!isHeld(held, now) || held.token !== lease.token) return null;
      const renewed = { token: held.token, expiresAt: now + ttlMs };
      await this.#put(state, { kind: "lease", key: lease.key, lease: renewed });
      return toLease(lease.key, renewed);
    });
  }

  async release(lease: Lease): Promise<void> {
    checkKey(lease.key);
    await this.#inTurn(async (state) => {
      if (state.leases.get(lease.key)?.token !== lease.token) return;
      await this.#log.remove("lease", lease.key);
      state.leases.delete(lease.key);
    });
  }

  async read(key: string): Promise<string | null> {
    checkKey(key);
    return this.#inTurn(async (state) => state.values.get(key) ?? null);
  }

  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    checkKey(key);
    checkValue(next);
    return this.#inTurn(async (state) => {
      if ((state.values.get(key) ?? null) !== expected) return false;
      if (next !== null) {
        await this.#put(state, { kind: "value", key, value: next });
        return true;
      }
      if (state.values.has(key)) {
        await this.#log.remove("value", key);
        state.values.delete(key);
      }
      return true;
    });
  }

  /**
   * Adds `by` unless the result would go above `limit`. Without a `limit` the
   * ceiling is `Number.MAX_SAFE_INTEGER`, and going above it is treated the
   * same way: `applied: false` and the counter stays as it is. A counter is
   * stored as a safe whole number, so a bigger one could not be loaded again.
   */
  async increment(key: string, by: number, limit?: number): Promise<CounterResult> {
    checkKey(key);
    checkAmount("by", by);
    if (limit !== undefined) checkAmount("limit", limit);
    const ceiling = limit ?? Number.MAX_SAFE_INTEGER;
    return this.#inTurn(async (state) => {
      const value = state.counters.get(key) ?? 0;
      if (value + by > ceiling) return { applied: false, value };
      await this.#put(state, { kind: "counter", key, value: value + by });
      return { applied: true, value: value + by };
    });
  }

  async countInWindow(key: string, windowMs: number, limit: number): Promise<WindowCount> {
    checkKey(key);
    checkAmount("windowMs", windowMs);
    checkAmount("limit", limit);
    return this.#inTurn(async (state, now) => {
      const current = state.windows.get(key);
      // The window covers its start up to, but not including, start + windowMs.
      const isOpen = current !== undefined && now < current.start + windowMs;
      const window = isOpen ? current : { start: now, count: 0 };
      const resetAt = new Date(window.start + windowMs).toISOString();
      if (window.count >= limit) return { allowed: false, count: limit, resetAt };
      const counted = { start: window.start, count: window.count + 1 };
      await this.#put(state, { kind: "window", key, window: counted });
      return { allowed: true, count: counted.count, resetAt };
    });
  }

  /** Writes the entry to the store, then to memory, so memory never runs ahead of the store. */
  async #put(state: CoordinationState, entry: StateEntry): Promise<void> {
    await this.#log.put(entry, !hasEntry(state, entry.kind, entry.key));
    addEntry(state, entry);
  }

  /** Runs one call after the calls before it, with the state and the time it starts at. */
  async #inTurn<T>(call: (state: CoordinationState, now: number) => Promise<T>): Promise<T> {
    const run = this.#lastCall.then(async () => {
      const state = await this.#loaded;
      return call(state, this.#clock.now().getTime());
    });
    // The next call waits for this one whether or not it fails; the caller
    // still gets this one's error.
    this.#lastCall = run.catch(() => undefined);
    return run;
  }
}

/** Whether a lease is held at `now`: it ends at its expiry time. */
function isHeld(lease: HeldLease | undefined, now: number): lease is HeldLease {
  return lease !== undefined && lease.expiresAt > now;
}

function toLease(key: string, held: HeldLease): Lease {
  return { key, token: held.token, expiresAt: new Date(held.expiresAt).toISOString() };
}
