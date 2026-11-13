import type { ScheduledTimer, Scheduler } from "@halonicjs/ports";
import type { RunObjectApi } from "./run-object-api.ts";

/**
 * The part of a Durable Object namespace this adapter uses. The namespace
 * bound to `RunObject` fits; tests give a plain one.
 */
export interface RunObjectNamespace<Id> {
  idFromName(name: string): Id;
  get(id: Id): RunObjectApi;
}

/** What a {@link DurableScheduler} needs. */
export interface DurableSchedulerOptions<Id> {
  /** The Durable Object namespace bound to `RunObject`. */
  namespace: RunObjectNamespace<Id>;
  /**
   * Put before every key to make the object's name, so several deployments
   * can share one namespace. Leave it out to use the key itself.
   */
  namePrefix?: string;
}

/**
 * The {@link Scheduler} port on Cloudflare. A key's timers live in the
 * `RunObject` named after the key, and the object's alarm delivers them to
 * the Worker's listener, which the object's subclass provides (the platform
 * wakes the object, not this client).
 *
 * Like `DurableCoordination` it holds no stub: every call gets a fresh one,
 * which works again after the object has been reset.
 */
export class DurableScheduler<Id = unknown> implements Scheduler {
  readonly #namespace: RunObjectNamespace<Id>;
  readonly #namePrefix: string;

  constructor(options: DurableSchedulerOptions<Id>) {
    this.#namespace = options.namespace;
    this.#namePrefix = options.namePrefix ?? "";
  }

  schedule(key: string, timerId: string, at: string): Promise<void> {
    return this.#object(key).schedule(key, timerId, at);
  }

  cancel(key: string, timerId: string): Promise<void> {
    return this.#object(key).cancel(key, timerId);
  }

  pending(key: string): Promise<ScheduledTimer[]> {
    return this.#object(key).pending(key);
  }

  #object(key: string): RunObjectApi {
    return this.#namespace.get(this.#namespace.idFromName(`${this.#namePrefix}${key}`));
  }
}
