import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import type {
  AppendOptions,
  AppendResult,
  RunFilter,
  RunSnapshot,
  RunStore,
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
    checkAppend(runId, expectedSeq, events);
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
      if (summary !== null && matches(summary, filter)) {
        summaries.push(summary);
      }
    }
    return summaries.sort(
      (a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id),
    );
  }
}

/** The caller's bugs the port turns into a `RangeError`, never a conflict. */
function checkAppend(runId: string, expectedSeq: number, events: readonly RunEvent[]): void {
  if (!Number.isSafeInteger(expectedSeq) || expectedSeq < 0) {
    throw new RangeError(`expectedSeq must be a whole number of 0 or more, not ${expectedSeq}.`);
  }
  if (events.length === 0) {
    throw new RangeError("append needs at least one event.");
  }
  events.forEach((event, index) => {
    if (event.runId !== runId) {
      throw new RangeError(`Event ${event.seq} belongs to run ${event.runId}, not ${runId}.`);
    }
    if (event.seq !== expectedSeq + index + 1) {
      throw new RangeError(`Event ${index} has seq ${event.seq}, not ${expectedSeq + index + 1}.`);
    }
  });
}

function matches(summary: RunSummary, filter: RunFilter): boolean {
  const statuses = filter.status === undefined ? undefined : [filter.status].flat();
  return (
    (filter.hubId === undefined || summary.hubId === filter.hubId) &&
    (filter.workflowId === undefined || summary.workflowId === filter.workflowId) &&
    (filter.kind === undefined || summary.kind === filter.kind) &&
    (statuses === undefined || statuses.includes(summary.status))
  );
}
