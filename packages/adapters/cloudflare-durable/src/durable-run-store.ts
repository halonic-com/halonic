import type { RunEvent, RunSummary } from "@halonicjs/events";
import type {
  AppendOptions,
  AppendResult,
  RunFilter,
  RunSnapshot,
  RunStore,
} from "@halonicjs/ports";
import type { RunObjectNamespace } from "./durable-scheduler.ts";
import type { RunObjectApi } from "./run-object-api.ts";

/** Where {@link DurableRunStore} reads the run list from. `D1RunList` fits. */
export interface RunListReader {
  list(filter?: RunFilter): Promise<RunSummary[]>;
}

/** What a {@link DurableRunStore} needs. */
export interface DurableRunStoreOptions<Id> {
  /** The Durable Object namespace bound to `RunObject`. */
  namespace: RunObjectNamespace<Id>;
  /** The run list the objects fill from their outbox. */
  runList: RunListReader;
  /** Put before every run id to make the object's name; leave it out to use the run id itself. */
  namePrefix?: string;
}

/**
 * The {@link RunStore} port on Cloudflare. A run's log is in the `RunObject` named after the run, so
 * every append to one run goes through one object, which checks `expectedSeq` and writes the events
 * and snapshot in one transaction. `get` is worked out from that log, so it is always current.
 * `list` reads the D1 run list, which the objects fill from their outbox and which may lag the log
 * for a short time, as the port allows.
 *
 * Like `DurableScheduler` it holds no stub: every call gets a fresh one.
 */
export class DurableRunStore<Id = unknown> implements RunStore {
  readonly #namespace: RunObjectNamespace<Id>;
  readonly #runList: RunListReader;
  readonly #namePrefix: string;

  constructor(options: DurableRunStoreOptions<Id>) {
    this.#namespace = options.namespace;
    this.#runList = options.runList;
    this.#namePrefix = options.namePrefix ?? "";
  }

  append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options?: AppendOptions,
  ): Promise<AppendResult> {
    return this.#object(runId).append(runId, expectedSeq, events, options);
  }

  events(runId: string, afterSeq?: number): Promise<RunEvent[]> {
    return this.#object(runId).events(afterSeq);
  }

  snapshot(runId: string): Promise<RunSnapshot | null> {
    return this.#object(runId).snapshot();
  }

  get(runId: string): Promise<RunSummary | null> {
    return this.#object(runId).summary();
  }

  list(filter?: RunFilter): Promise<RunSummary[]> {
    return this.#runList.list(filter);
  }

  #object(runId: string): RunObjectApi {
    return this.#namespace.get(this.#namespace.idFromName(`${this.#namePrefix}${runId}`));
  }
}
