import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import {
  type AppendOptions,
  type AppendResult,
  checkRunAppend,
  compareRunSummaries,
  matchesRunFilter,
  type RunFilter,
  type RunSnapshot,
  type RunStore,
} from "@halonicjs/ports";
import { copyJson } from "./copy.ts";

/** One append a {@link DryRunRunStore} was asked to make, in the order it was asked. */
export interface PlannedRunAppend {
  readonly runId: string;
  readonly events: readonly RunEvent[];
}

/** The events a dry run added to one run, and the snapshot that came with the latest of them. */
interface PendingRun {
  /** The run's last real event when the dry run first appended to it; later real events are not read. */
  readonly baseSeq: number;
  events: RunEvent[];
  snapshot: RunSnapshot | null;
}

/**
 * A dry run of another run store: it reads through to that store, but keeps
 * every append in memory and records it, so the real run history never
 * changes. `changes()` then reports what would have happened, as Compose's
 * `pkg/dryrun` does for its service.
 *
 * Reads see the pending events after the real ones, so an engine that appends
 * and reads its run back behaves as it would for real. An append follows the
 * same rules as a real one: it is refused with a RangeError for a caller's
 * bug, and it gives `conflict` unless `expectedSeq` is the last event the dry
 * run knows of, real or pending. Appends run one at a time, so two writers
 * with the same `expectedSeq` can't both win.
 *
 * Once a run has pending events, its last real event is the one the dry run
 * saw at the first pending append. Events another writer adds to the real
 * store after that are not merged in.
 */
export class DryRunRunStore implements RunStore {
  readonly #source: RunStore;
  readonly #pending = new Map<string, PendingRun>();
  readonly #changes: PlannedRunAppend[] = [];
  /** The append in progress, so the next one waits for it. */
  #lastAppend: Promise<unknown> = Promise.resolve();

  /** @param source - the store whose runs the dry run starts from; it is only read */
  constructor(source: RunStore) {
    this.#source = source;
  }

  /** Keeps the events and records the append; the store under it is not changed. */
  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    checkRunAppend(runId, expectedSeq, events);
    const append = this.#lastAppend.then(() =>
      this.#appendNow(runId, expectedSeq, events, options),
    );
    // A failed read of the store under it fails this append only, not the ones after it.
    this.#lastAppend = append.catch(() => {});
    return await append;
  }

  async #appendNow(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions,
  ): Promise<AppendResult> {
    const lastSeq = await this.#lastSeq(runId);
    if (lastSeq !== expectedSeq) {
      return { ok: false, reason: "conflict", lastSeq };
    }
    const pending = this.#pending.get(runId) ?? {
      baseSeq: expectedSeq,
      events: [],
      snapshot: null,
    };
    const copies = copyJson(events);
    pending.events.push(...copies);
    const newLastSeq = expectedSeq + copies.length;
    if (options.snapshot !== undefined) {
      pending.snapshot = { seq: newLastSeq, state: copyJson(options.snapshot) };
    }
    this.#pending.set(runId, pending);
    this.#changes.push(Object.freeze({ runId, events: Object.freeze(copyJson(copies)) }));
    return { ok: true, lastSeq: newLastSeq };
  }

  /** The sequence number of the run's last event, pending or else real; 0 for an unknown run. */
  async #lastSeq(runId: string): Promise<number> {
    const pending = this.#pending.get(runId)?.events.at(-1);
    if (pending !== undefined) {
      return pending.seq;
    }
    return (await this.#source.get(runId))?.lastSeq ?? 0;
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    const real = await this.#source.events(runId, afterSeq);
    const pending = this.#pending.get(runId);
    if (pending === undefined) {
      return real;
    }
    return [
      ...real.filter((event) => event.seq <= pending.baseSeq),
      ...copyJson(pending.events.filter((event) => event.seq > afterSeq)),
    ];
  }

  async snapshot(runId: string): Promise<RunSnapshot | null> {
    const pending = this.#pending.get(runId);
    if (pending?.snapshot) {
      return copyJson(pending.snapshot);
    }
    const real = await this.#source.snapshot(runId);
    if (pending === undefined || real === null) {
      return real;
    }
    // A real snapshot taken after the dry run's base belongs to another writer's events.
    return real.seq <= pending.baseSeq ? real : null;
  }

  async get(runId: string): Promise<RunSummary | null> {
    if (!this.#pending.has(runId)) {
      return await this.#source.get(runId);
    }
    return summarize(await this.events(runId));
  }

  /**
   * The real list, with each run that has pending events summarized again
   * from its real and pending events. Runs the dry run started are added.
   */
  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    const real = await this.#source.list(filter);
    const summaries = real.filter((summary) => !this.#pending.has(summary.id));
    for (const runId of this.#pending.keys()) {
      const summary = await this.get(runId);
      if (summary !== null && matchesRunFilter(summary, filter)) {
        summaries.push(summary);
      }
    }
    return summaries.sort(compareRunSummaries);
  }

  /** Every append that succeeded so far, in order: what a real run would have stored. Each entry is frozen. */
  changes(): PlannedRunAppend[] {
    return [...this.#changes];
  }
}
