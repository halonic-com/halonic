import type { RunEvent, RunSummary } from "@halonicjs/events";
import type {
  AppendOptions,
  AppendResult,
  RunFilter,
  RunSnapshot,
  RunStore,
} from "@halonicjs/ports";

/**
 * A run store that says when a run's log has moved on, after every append
 * that lands, whoever makes it: a step, a harness call or a model call's
 * turn. So a subscriber sees a long call's events as they are written, not
 * when the call ends (HAL-5214).
 */
export class WatchedRuns implements RunStore {
  readonly #store: RunStore;
  readonly #moved: (runId: string) => void;

  /** @param moved - called after each append that lands, with the run's id */
  constructor(store: RunStore, moved: (runId: string) => void) {
    this.#store = store;
    this.#moved = moved;
  }

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options?: AppendOptions,
  ): Promise<AppendResult> {
    const result = await this.#store.append(runId, expectedSeq, events, options);
    if (result.ok) this.#moved(runId);
    return result;
  }

  events(runId: string, afterSeq?: number): Promise<RunEvent[]> {
    return this.#store.events(runId, afterSeq);
  }

  snapshot(runId: string): Promise<RunSnapshot | null> {
    return this.#store.snapshot(runId);
  }

  get(runId: string): Promise<RunSummary | null> {
    return this.#store.get(runId);
  }

  list(filter?: RunFilter): Promise<RunSummary[]> {
    return this.#store.list(filter);
  }
}
