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

interface StoredRun {
  events: RunEvent[];
  snapshot: RunSnapshot | null;
}

/**
 * Run logs in a map. The list is worked out from the logs on every call, so
 * it never lags. JavaScript runs one call at a time between awaits, and
 * `append` has no await, so two appends can't interleave.
 */
export class MemoryRunStore implements RunStore {
  readonly #runs = new Map<string, StoredRun>();

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    checkRunAppend(runId, expectedSeq, events);
    const run = this.#runs.get(runId) ?? { events: [], snapshot: null };
    const lastSeq = run.events.length;
    if (lastSeq !== expectedSeq) {
      return { ok: false, reason: "conflict", lastSeq };
    }
    run.events.push(...copyJson(events));
    if (options.snapshot !== undefined) {
      run.snapshot = { seq: run.events.length, state: copyJson(options.snapshot) };
    }
    this.#runs.set(runId, run);
    return { ok: true, lastSeq: run.events.length };
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    const events = this.#runs.get(runId)?.events ?? [];
    return copyJson(events.filter((event) => event.seq > afterSeq));
  }

  async snapshot(runId: string): Promise<RunSnapshot | null> {
    return copyJson(this.#runs.get(runId)?.snapshot ?? null);
  }

  async get(runId: string): Promise<RunSummary | null> {
    return summarize(this.#runs.get(runId)?.events ?? []);
  }

  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    const summaries: RunSummary[] = [];
    for (const run of this.#runs.values()) {
      const summary = summarize(run.events);
      if (summary !== null && matchesRunFilter(summary, filter)) {
        summaries.push(summary);
      }
    }
    return summaries.sort(compareRunSummaries);
  }
}
