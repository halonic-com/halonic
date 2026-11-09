import type { RunEvent, RunKind, RunStatus, RunSummary } from "@halonicjs/events";

/** Version of the {@link RunStore} port. A breaking change bumps it and comes with an ADR. */
export const runStoreVersion = 1;

/** Which runs {@link RunStore.list} returns. Every field narrows the list; none means all runs. */
export interface RunFilter {
  hubId?: string;
  workflowId?: string;
  kind?: RunKind;
  /**
   * One status or any of several, such as `["running", "waiting"]` for the
   * watchdog. An empty list is no status filter, the same as leaving it out.
   */
  status?: RunStatus | readonly RunStatus[];
}

/**
 * What {@link RunStore.append} did. `lastSeq` is the sequence number of the
 * run's last stored event afterwards, so a writer that lost the race knows
 * where the log is now.
 *
 * A lost race is the error kind `conflict` from `@halonicjs/std`, so a surface
 * that reports it responds the same way as to any other conflict. The ports
 * may not import std (docs/adr/2026-11-09-api-types-stand-alone.md), so the
 * run-store contract in `@halonicjs/testing-contracts` checks that the two
 * stay the same.
 */
export type AppendResult =
  | { ok: true; lastSeq: number }
  | { ok: false; reason: "conflict"; lastSeq: number };

/** Options for {@link RunStore.append}. */
export interface AppendOptions {
  /**
   * The engine's state after these events, as plain JSON data. It is stored
   * in the same write as the events, or not at all, so the next step starts
   * from it instead of replaying the whole log.
   */
  snapshot?: unknown;
}

/** The latest state snapshot of a run, and the sequence number of the last event it includes. */
export interface RunSnapshot {
  seq: number;
  state: unknown;
}

/**
 * The append-only run event logs and the run list. The log is the truth and
 * the list is a copy of it, worked out with `summarize`
 * from `@halonicjs/events`.
 */
export interface RunStore {
  /**
   * Appends events to a run's log, but only if its last stored event is
   * `expectedSeq` (0 for a new run), so two writers can never both win.
   * The events, and the snapshot when given, are stored together or not at
   * all.
   *
   * @param runId - the run the events belong to; every event carries it too
   * @param expectedSeq - the sequence number of the last event the writer saw
   * @param events - at least one, numbered `expectedSeq + 1`, `expectedSeq + 2` …
   * @returns `ok: false` with reason "conflict" when the log has moved on
   * @throws RangeError when `events` is empty, misnumbered, or carries another
   *   run id, or `expectedSeq` isn't a whole number of 0 or more. These are the
   *   caller's bugs and are never reported as a conflict.
   */
  append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options?: AppendOptions,
  ): Promise<AppendResult>;
  /** A run's events, oldest first; with `afterSeq`, only those after it. Empty for an unknown run. */
  events(runId: string, afterSeq?: number): Promise<RunEvent[]>;
  /** The run's latest snapshot, or `null` when it has none or the run is unknown. */
  snapshot(runId: string): Promise<RunSnapshot | null>;
  /** A run's summary, or `null` for an unknown run. Always up to date with the log. */
  get(runId: string): Promise<RunSummary | null>;
  /**
   * The summaries of the runs that match the filter, newest start time first.
   * The list may lag the log for a short time (on Cloudflare it is filled
   * from an outbox); use {@link RunStore.get} when one run must be current.
   */
  list(filter?: RunFilter): Promise<RunSummary[]>;
}

// The rules above, as code, so every adapter checks appends and filters runs the same way.

/**
 * Refuses an append that is the caller's bug, as {@link RunStore.append}
 * says: `expectedSeq` that isn't a whole number of 0 or more, no events,
 * an event of another run, or events not numbered from `expectedSeq + 1`.
 *
 * @throws RangeError naming what is wrong
 */
export function checkRunAppend(
  runId: string,
  expectedSeq: number,
  events: readonly RunEvent[],
): void {
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

/** Whether a summary matches every field of a {@link RunFilter}. An empty status list is no status filter. */
export function matchesRunFilter(summary: RunSummary, filter: RunFilter): boolean {
  const statuses = filter.status === undefined ? [] : [filter.status].flat();
  return (
    (filter.hubId === undefined || summary.hubId === filter.hubId) &&
    (filter.workflowId === undefined || summary.workflowId === filter.workflowId) &&
    (filter.kind === undefined || summary.kind === filter.kind) &&
    (statuses.length === 0 || statuses.includes(summary.status))
  );
}

/** Orders summaries as {@link RunStore.list} returns them: newest start time first, then by run id. */
export function compareRunSummaries(a: RunSummary, b: RunSummary): number {
  return b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id);
}
