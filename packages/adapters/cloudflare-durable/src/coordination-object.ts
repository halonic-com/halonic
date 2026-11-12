import { DurableObject } from "cloudflare:workers";
import type { Coordination, CounterResult, Lease, WindowCount } from "@halonicjs/ports";
import { type Clock, systemClock } from "@halonicjs/std";
import { CoordinationState } from "./coordination-state.ts";

/**
 * The Durable Object that holds a deployment's leases, values, counters and
 * windows. It does nothing itself: each method is a `Coordination` method of
 * {@link CoordinationState}, over this object's own storage, and callers use
 * them through `DurableCoordination`.
 *
 * Never rename or delete this class once it has been deployed: Cloudflare
 * deletes a Durable Object class's data with it. The names are fixed in
 * `durableObjectClassNames` and in the package README.
 */
export class CoordinationObject extends DurableObject implements Coordination {
  /** The time leases and windows run out by. Only a test replaces it. */
  protected clock: Clock = systemClock;
  readonly #state: CoordinationState;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Read through `this.clock` on every call, so a subclass's clock counts.
    this.#state = new CoordinationState(ctx.storage, { now: () => this.clock.now() });
  }

  tryAcquire(key: string, ttlMs: number): Promise<Lease | null> {
    return this.#state.tryAcquire(key, ttlMs);
  }

  renew(lease: Lease, ttlMs: number): Promise<Lease | null> {
    return this.#state.renew(lease, ttlMs);
  }

  release(lease: Lease): Promise<void> {
    return this.#state.release(lease);
  }

  read(key: string): Promise<string | null> {
    return this.#state.read(key);
  }

  compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    return this.#state.compareAndSet(key, expected, next);
  }

  increment(key: string, by: number, limit?: number): Promise<CounterResult> {
    return this.#state.increment(key, by, limit);
  }

  countInWindow(key: string, windowMs: number, limit: number): Promise<WindowCount> {
    return this.#state.countInWindow(key, windowMs, limit);
  }
}
