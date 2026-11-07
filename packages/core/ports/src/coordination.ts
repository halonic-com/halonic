/** Version of the {@link Coordination} port. A breaking change bumps it and comes with an ADR. */
export const coordinationVersion = 1;

/** The right to do something alone until `expiresAt`. A lease is never held across a crash for good. */
export interface Lease {
  key: string;
  /** Proves who holds the lease; renewing or releasing with an old token does nothing. */
  token: string;
  /** ISO time the lease ends unless it is renewed. */
  expiresAt: string;
}

/** What {@link Coordination.increment} did, and the counter's value afterwards. */
export interface CounterResult {
  applied: boolean;
  value: number;
}

/** What {@link Coordination.countInWindow} decided. */
export interface WindowCount {
  /** Whether this attempt was within the limit; only allowed attempts are counted. */
  allowed: boolean;
  /** Attempts counted in the current window, this one included when allowed. */
  count: number;
  /** ISO time the current window ends and counting starts again. */
  resetAt: string;
}

/**
 * Leases, values and counters shared by every instance of a deployment: a
 * routine fires once, a run advances in one place, login limits and the
 * budget hold (multi-cloud ADR 5.3). Nothing can hold a lock across an
 * `await`, so locks are leases with a time limit.
 *
 * Leases, values, counters and windows each have their own keys: the same key
 * in two of them names two different things. Every operation is atomic.
 */
export interface Coordination {
  /** Takes the lease for `ttlMs` milliseconds, or returns `null` while someone else holds it. */
  tryAcquire(key: string, ttlMs: number): Promise<Lease | null>;
  /** Extends a lease still held, or returns `null` when it ran out or was taken over. */
  renew(lease: Lease, ttlMs: number): Promise<Lease | null>;
  /** Gives a lease back. Releasing one that ran out or was taken over does nothing. */
  release(lease: Lease): Promise<void>;
  /** A value, or `null` when it isn't set. */
  read(key: string): Promise<string | null>;
  /** Sets the value only if it is still `expected` (`null`: not set yet). Returns whether it did. */
  compareAndSet(key: string, expected: string | null, next: string): Promise<boolean>;
  /**
   * Adds `by` to a counter that starts at 0, unless the result would go above
   * `limit`; then it leaves the counter as it is.
   */
  increment(key: string, by: number, limit?: number): Promise<CounterResult>;
  /**
   * Counts one attempt in a fixed window of `windowMs` milliseconds that
   * starts with its first attempt, if fewer than `limit` were counted in it.
   * Parallel attempts never let more than `limit` through.
   */
  countInWindow(key: string, windowMs: number, limit: number): Promise<WindowCount>;
}
