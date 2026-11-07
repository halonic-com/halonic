import type { RunEvent, RunKind, RunSummary } from "@halonicjs/events";

/** Version of the {@link RunStore} port. A breaking change bumps it and comes with an ADR. */
export const runStoreVersion = 1;

/** Which runs {@link RunStore.list} returns. Every field narrows the list; none means all runs. */
export interface RunFilter {
  hubId?: string;
  workflowId?: string;
  kind?: RunKind;
}

/**
 * What {@link RunStore.append} did. `lastSeq` is the sequence number of the
 * run's last stored event afterwards, so a writer that lost the race knows
 * where the log is now.
 */
export type AppendResult =
  | { ok: true; lastSeq: number }
  | { ok: false; reason: "conflict"; lastSeq: number };

/**
 * The append-only run event logs and the run list. The log is the truth and
 * the list is a copy of it (multi-cloud ADR 5.3), worked out with `summarize`
 * from `@halonicjs/events`.
 */
export interface RunStore {
  /**
   * Appends events to a run's log, but only if its last stored event is
   * `expectedSeq` (0 for a new run), so two writers can never both win.
   * The events are stored together or not at all.
   *
   * @param runId - the run the events belong to; every event carries it too
   * @param expectedSeq - the sequence number of the last event the writer saw
   * @param events - numbered `expectedSeq + 1`, `expectedSeq + 2` …
   * @returns `ok: false` with reason "conflict" when the log has moved on
   */
  append(runId: string, expectedSeq: number, events: readonly RunEvent[]): Promise<AppendResult>;
  /** A run's events, oldest first; with `afterSeq`, only those after it. Empty for an unknown run. */
  events(runId: string, afterSeq?: number): Promise<RunEvent[]>;
  /** A run's summary, or `null` for an unknown run. */
  get(runId: string): Promise<RunSummary | null>;
  /** The summaries of the runs that match the filter, newest start time first. */
  list(filter?: RunFilter): Promise<RunSummary[]>;
}
