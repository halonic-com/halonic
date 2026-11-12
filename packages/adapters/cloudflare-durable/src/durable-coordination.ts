import type { Coordination, CounterResult, Lease, WindowCount } from "@halonicjs/ports";

/** The object name used when a deployment doesn't pick one. */
export const defaultCoordinationObjectName = "coordination";

/**
 * The part of a Durable Object namespace this adapter uses. The namespace
 * bound to `CoordinationObject` fits; tests give a plain one.
 */
export interface CoordinationNamespace<Id> {
  idFromName(name: string): Id;
  get(id: Id): Coordination;
}

/** What a {@link DurableCoordination} needs. */
export interface DurableCoordinationOptions<Id> {
  /** The Durable Object namespace bound to `CoordinationObject`. */
  namespace: CoordinationNamespace<Id>;
  /**
   * Names the object that holds the state. One deployment uses one name:
   * state under another name is a separate, empty set.
   */
  objectName?: string;
}

/**
 * The {@link Coordination} port on Cloudflare. Every call goes to one
 * `CoordinationObject`, which does it atomically and reads its own
 * clock, so Workers instances with different clocks still agree on when a
 * lease or window ends.
 *
 * It is safe to keep across requests: it holds the object's id, not a stub,
 * and gets a fresh stub for every call. A stub breaks after the object
 * resets (a deploy, an overload), and a fresh one works again.
 */
export class DurableCoordination<Id = unknown> implements Coordination {
  readonly #namespace: CoordinationNamespace<Id>;
  readonly #id: Id;

  constructor(options: DurableCoordinationOptions<Id>) {
    const { namespace, objectName = defaultCoordinationObjectName } = options;
    this.#namespace = namespace;
    this.#id = namespace.idFromName(objectName);
  }

  /** Local and cheap (no network round trip); a new one per call avoids a broken stub. */
  #object(): Coordination {
    return this.#namespace.get(this.#id);
  }

  tryAcquire(key: string, ttlMs: number): Promise<Lease | null> {
    return this.#object().tryAcquire(key, ttlMs);
  }

  renew(lease: Lease, ttlMs: number): Promise<Lease | null> {
    return this.#object().renew(lease, ttlMs);
  }

  release(lease: Lease): Promise<void> {
    return this.#object().release(lease);
  }

  read(key: string): Promise<string | null> {
    return this.#object().read(key);
  }

  compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    return this.#object().compareAndSet(key, expected, next);
  }

  increment(key: string, by: number, limit?: number): Promise<CounterResult> {
    return this.#object().increment(key, by, limit);
  }

  countInWindow(key: string, windowMs: number, limit: number): Promise<WindowCount> {
    return this.#object().countInWindow(key, windowMs, limit);
  }
}
