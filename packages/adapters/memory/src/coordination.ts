import type { Clock, Coordination, CounterResult, Lease, WindowCount } from "@halonicjs/ports";

const maxKeyBytes = 256;
const maxValueBytes = 64 * 1024;

interface HeldLease {
  token: string;
  expiresAt: number;
}

interface Window {
  start: number;
  count: number;
}

/**
 * Leases, values, counters and windows in four maps, read against the clock
 * it was given. Every method checks its input before it awaits or changes
 * anything, and JavaScript runs one call at a time between awaits, so every
 * operation is atomic as the port requires.
 */
export class MemoryCoordination implements Coordination {
  readonly #clock: Clock;
  readonly #leases = new Map<string, HeldLease>();
  readonly #values = new Map<string, string>();
  readonly #counters = new Map<string, number>();
  readonly #windows = new Map<string, Window>();
  #tokens = 0;

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  async tryAcquire(key: string, ttlMs: number): Promise<Lease | null> {
    checkKey(key);
    checkAmount("ttlMs", ttlMs);
    const now = this.#now();
    const held = this.#leases.get(key);
    if (held !== undefined && held.expiresAt > now) {
      return null;
    }
    this.#tokens += 1;
    const lease = { token: `lease_${this.#tokens}`, expiresAt: now + ttlMs };
    this.#leases.set(key, lease);
    return toLease(key, lease);
  }

  async renew(lease: Lease, ttlMs: number): Promise<Lease | null> {
    checkKey(lease.key);
    checkAmount("ttlMs", ttlMs);
    const now = this.#now();
    const held = this.#leases.get(lease.key);
    if (held === undefined || held.token !== lease.token || held.expiresAt <= now) {
      return null;
    }
    held.expiresAt = now + ttlMs;
    return toLease(lease.key, held);
  }

  async release(lease: Lease): Promise<void> {
    checkKey(lease.key);
    if (this.#leases.get(lease.key)?.token === lease.token) {
      this.#leases.delete(lease.key);
    }
  }

  async read(key: string): Promise<string | null> {
    checkKey(key);
    return this.#values.get(key) ?? null;
  }

  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    checkKey(key);
    if (next !== null && utf8Bytes(next) > maxValueBytes) {
      throw new RangeError(`A coordination value is at most ${maxValueBytes} UTF-8 bytes.`);
    }
    if ((this.#values.get(key) ?? null) !== expected) {
      return false;
    }
    if (next === null) {
      this.#values.delete(key);
    } else {
      this.#values.set(key, next);
    }
    return true;
  }

  async increment(key: string, by: number, limit?: number): Promise<CounterResult> {
    checkKey(key);
    checkAmount("by", by);
    if (limit !== undefined) {
      checkAmount("limit", limit);
    }
    const value = this.#counters.get(key) ?? 0;
    if (limit !== undefined && value + by > limit) {
      return { applied: false, value };
    }
    this.#counters.set(key, value + by);
    return { applied: true, value: value + by };
  }

  async countInWindow(key: string, windowMs: number, limit: number): Promise<WindowCount> {
    checkKey(key);
    checkAmount("windowMs", windowMs);
    checkAmount("limit", limit);
    const now = this.#now();
    let window = this.#windows.get(key);
    if (window === undefined || now >= window.start + windowMs) {
      window = { start: now, count: 0 };
      this.#windows.set(key, window);
    }
    const resetAt = new Date(window.start + windowMs).toISOString();
    if (window.count >= limit) {
      return { allowed: false, count: limit, resetAt };
    }
    window.count += 1;
    return { allowed: true, count: window.count, resetAt };
  }

  #now(): number {
    return this.#clock.now().getTime();
  }
}

function toLease(key: string, held: HeldLease): Lease {
  return { key, token: held.token, expiresAt: new Date(held.expiresAt).toISOString() };
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function checkKey(key: string): void {
  const bytes = utf8Bytes(key);
  if (bytes < 1 || bytes > maxKeyBytes) {
    throw new RangeError(`A coordination key is 1 to ${maxKeyBytes} UTF-8 bytes, not ${bytes}.`);
  }
}

function checkAmount(name: string, amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError(`${name} must be a positive safe whole number, not ${amount}.`);
  }
}
