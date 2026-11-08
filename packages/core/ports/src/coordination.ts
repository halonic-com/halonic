/** Version of the {@link Coordination} port. A breaking change bumps it and comes with an ADR. */
export const coordinationVersion = 1;

/** The right to do something alone until `expiresAt`. A lease is never held across a crash for good. */
export interface Lease {
  /** The key the lease was taken on. */
  key: string;
  /** Proves who holds the lease; renewing or releasing with an old token does nothing. Renewing keeps it. */
  token: string;
  /**
   * ISO time the lease ends unless it is renewed, by the adapter's clock.
   * For display and logs only: callers don't compare it with their own clock
   * to decide whether they still hold the lease; they renew and check the result.
   */
  expiresAt: string;
}

/** What {@link Coordination.increment} did, and the counter's value afterwards. */
export interface CounterResult {
  /** Whether `by` was added; `false` when it would have gone above the limit. */
  applied: boolean;
  /** The counter's value after the call, whether or not `by` was added. */
  value: number;
}

/** What {@link Coordination.countInWindow} decided. */
export interface WindowCount {
  /** Whether this attempt was within the limit; only allowed attempts are counted. */
  allowed: boolean;
  /** Attempts counted in the current window, this one included when allowed; `limit` when refused. */
  count: number;
  /** ISO time the current window ends and counting starts again. A refused attempt doesn't move it. */
  resetAt: string;
}

/**
 * Leases, values and counters shared by every instance of a deployment: a
 * routine fires once, a run advances in one place, login limits and the
 * budget hold. Nothing can hold a lock across an
 * `await`, so locks are leases with a time limit.
 *
 * Leases, values, counters and windows each have their own keys: the same key
 * in two of them names two different things. Every operation is atomic.
 *
 * **Input rules**, the same on every adapter:
 * - Keys are 1 to 256 UTF-8 bytes. Core hashes user input (an email
 *   address, a file name) before putting it in a key.
 * - A value set with `compareAndSet` is at most 64 KiB of UTF-8, below
 *   the per-value limit of Durable Objects storage.
 * - `ttlMs`, `windowMs`, `limit` and `by` are positive safe whole numbers.
 *   Amounts that have fractions, such as the budget, are counted in whole
 *   micro-units (1 = 0.000001), so every store adds them up the same way.
 * - Breaking a rule throws a `RangeError` and changes nothing.
 */
export interface Coordination {
  /**
   * Takes the lease for `ttlMs` milliseconds, or returns `null` while anyone
   * holds it, the caller included.
   */
  tryAcquire(key: string, ttlMs: number): Promise<Lease | null>;
  /**
   * Extends a lease still held to `ttlMs` milliseconds from now, keeping its
   * token, or returns `null` when it ran out or was taken over.
   */
  renew(lease: Lease, ttlMs: number): Promise<Lease | null>;
  /** Gives a lease back. Releasing one that ran out or was taken over does nothing. */
  release(lease: Lease): Promise<void>;
  /** A value, or `null` when it isn't set. */
  read(key: string): Promise<string | null>;
  /**
   * Sets the value only if it is still `expected` (`null`: not set). A `next`
   * of `null` deletes it. Returns whether it changed.
   */
  compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean>;
  /**
   * Adds `by` to a counter that starts at 0, unless the result would go above
   * `limit`; then it leaves the counter as it is. Counters only go up.
   */
  increment(key: string, by: number, limit?: number): Promise<CounterResult>;
  /**
   * Counts one attempt in a fixed window of `windowMs` milliseconds that
   * starts with its first attempt, if fewer than `limit` were counted in it.
   * The window covers `start` up to but not including `start + windowMs`; an
   * attempt at that moment opens a new window. Parallel attempts never let
   * more than `limit` through.
   */
  countInWindow(key: string, windowMs: number, limit: number): Promise<WindowCount>;
}
