import type { Clock, Coordination, CounterResult, Lease, WindowCount } from "@halonicjs/ports";
import { checkAmount, checkKey, checkValue } from "./input-rules.ts";

/** What a change reads and writes while it runs: the part of Durable Object storage this adapter uses. */
export interface StateTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

/** Where the state lives: a Durable Object's storage, or a fake in tests. */
export interface StateStorage {
  /** Runs `change` as one atomic step: its writes all happen, or none do, and nothing interleaves. */
  transaction<T>(change: (transaction: StateTransaction) => Promise<T>): Promise<T>;
  get<T>(key: string): Promise<T | undefined>;
}

/** A lease as kept in storage, with its expiry as milliseconds since 1970. */
interface HeldLease {
  token: string;
  expiresAt: number;
}

/** A login-limit window as kept in storage. */
interface StoredWindow {
  start: number;
  count: number;
}

/**
 * Leases, values, counters and windows each have their own keys, so each
 * kind gets its own storage prefix. A prefix ends at its first colon, so no
 * key of one kind can ever name an entry of another.
 */
const prefixes = {
  lease: "lease:",
  value: "value:",
  counter: "counter:",
  window: "window:",
} as const;

/**
 * The `Coordination` port over a {@link StateStorage}. Each call reads and
 * writes inside one storage transaction, so every operation is atomic and
 * parallel attempts can't both pass a limit. `CoordinationObject` runs it
 * inside a Durable Object, which runs one request at a time.
 */
export class CoordinationState implements Coordination {
  readonly #storage: StateStorage;
  readonly #clock: Clock;

  constructor(storage: StateStorage, clock: Clock) {
    this.#storage = storage;
    this.#clock = clock;
  }

  /** Takes the lease for `ttlMs`, or answers `null` while anyone holds it. */
  async tryAcquire(key: string, ttlMs: number): Promise<Lease | null> {
    checkKey(key);
    checkAmount("ttlMs", ttlMs);
    return this.#atomically(async (transaction) => {
      const now = this.#now();
      const storageKey = prefixes.lease + key;
      const held = await transaction.get<HeldLease>(storageKey);
      if (isHeld(held, now)) return null;
      const lease = { token: crypto.randomUUID(), expiresAt: now + ttlMs };
      await transaction.put(storageKey, lease);
      return toLease(key, lease);
    });
  }

  /** Extends a lease still held, keeping its token, or answers `null`. */
  async renew(lease: Lease, ttlMs: number): Promise<Lease | null> {
    checkKey(lease.key);
    checkAmount("ttlMs", ttlMs);
    return this.#atomically(async (transaction) => {
      const now = this.#now();
      const storageKey = prefixes.lease + lease.key;
      const held = await transaction.get<HeldLease>(storageKey);
      if (!isHeld(held, now) || held.token !== lease.token) return null;
      const renewed = { token: held.token, expiresAt: now + ttlMs };
      await transaction.put(storageKey, renewed);
      return toLease(lease.key, renewed);
    });
  }

  /** Gives a lease back; does nothing for one that ran out or was taken over. */
  async release(lease: Lease): Promise<void> {
    checkKey(lease.key);
    await this.#atomically(async (transaction) => {
      const storageKey = prefixes.lease + lease.key;
      const held = await transaction.get<HeldLease>(storageKey);
      if (held?.token === lease.token) await transaction.delete(storageKey);
    });
  }

  /** A value, or `null` when it isn't set. */
  async read(key: string): Promise<string | null> {
    checkKey(key);
    return (await this.#storage.get<string>(prefixes.value + key)) ?? null;
  }

  /** Sets the value only while it is still `expected`; a `next` of `null` deletes it. */
  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    checkKey(key);
    checkValue(next);
    return this.#atomically(async (transaction) => {
      const storageKey = prefixes.value + key;
      const current = (await transaction.get<string>(storageKey)) ?? null;
      if (current !== expected) return false;
      if (next === null) {
        await transaction.delete(storageKey);
      } else {
        await transaction.put(storageKey, next);
      }
      return true;
    });
  }

  /**
   * Adds `by` unless the result would go above `limit`. Without a `limit`
   * the ceiling is `Number.MAX_SAFE_INTEGER`, so a counter always stays a
   * safe whole number.
   */
  async increment(key: string, by: number, limit?: number): Promise<CounterResult> {
    checkKey(key);
    checkAmount("by", by);
    if (limit !== undefined) checkAmount("limit", limit);
    const ceiling = limit ?? Number.MAX_SAFE_INTEGER;
    return this.#atomically(async (transaction) => {
      const storageKey = prefixes.counter + key;
      const value = (await transaction.get<number>(storageKey)) ?? 0;
      if (value + by > ceiling) return { applied: false, value };
      await transaction.put(storageKey, value + by);
      return { applied: true, value: value + by };
    });
  }

  /** Counts one attempt in a fixed window that starts with its first attempt, if under `limit`. */
  async countInWindow(key: string, windowMs: number, limit: number): Promise<WindowCount> {
    checkKey(key);
    checkAmount("windowMs", windowMs);
    checkAmount("limit", limit);
    return this.#atomically(async (transaction) => {
      const now = this.#now();
      const storageKey = prefixes.window + key;
      const stored = await transaction.get<StoredWindow>(storageKey);
      // The window covers its start up to, but not including, start + windowMs.
      const isOpen = stored !== undefined && now < stored.start + windowMs;
      const window = isOpen ? stored : { start: now, count: 0 };
      const resetAt = new Date(window.start + windowMs).toISOString();
      if (window.count >= limit) return { allowed: false, count: limit, resetAt };
      await transaction.put(storageKey, { start: window.start, count: window.count + 1 });
      return { allowed: true, count: window.count + 1, resetAt };
    });
  }

  #now(): number {
    return this.#clock.now().getTime();
  }

  #atomically<T>(change: (transaction: StateTransaction) => Promise<T>): Promise<T> {
    return this.#storage.transaction(change);
  }
}

/** Whether a lease is held at `now`: it ends at its expiry time. */
function isHeld(lease: HeldLease | undefined, now: number): lease is HeldLease {
  return lease !== undefined && lease.expiresAt > now;
}

function toLease(key: string, held: HeldLease): Lease {
  return { key, token: held.token, expiresAt: new Date(held.expiresAt).toISOString() };
}
