import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { AppendOptions, AppendResult, RunSnapshot, ScheduledTimer } from "@halonicjs/ports";

/**
 * What the watchdog needs to know of a run object to tell whether its run is stuck.
 */
export interface RunHealth {
  /** ISO time of the run's last event, `null` while its log is empty. */
  lastEventAt: string | null;
  /**
   * Whether the run's own log says it has ended. The run list may still show it as running
   * for a while, so the watchdog trusts this over the list.
   */
  ended: boolean;
  /** How long the earliest timer has been due and undelivered, in ms; 0 when no timer is due. */
  overdueMs: number;
}

/**
 * What a client can call on a {@link RunObject}: the run's log and the timers
 * of its key. The object is named after the run, so every call is about that run.
 *
 * A write (`append`, `schedule`) gives the name prefix the client named the object under, its
 * scope; empty when unscoped. The first write notes it, and a later write under another prefix is
 * refused with a `RangeError`.
 */
export interface RunObjectApi {
  append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options?: AppendOptions,
    namePrefix?: string,
  ): Promise<AppendResult>;
  events(afterSeq?: number): Promise<RunEvent[]>;
  /**
   * The events after `afterSeq` as newline-delimited JSON, one event a line, then each new event as
   * it is stored. The stream closes after the event that ends the run, and errors when it breaks.
   */
  watch(afterSeq?: number): Promise<ReadableStream<Uint8Array>>;
  snapshot(): Promise<RunSnapshot | null>;
  /** The run's summary, worked out from its log, or `null` for a log that is empty. */
  summary(): Promise<RunSummary | null>;
  /** How the run is moving, for the watchdog. */
  health(): Promise<RunHealth>;
  schedule(key: string, timerId: string, at: string, namePrefix?: string): Promise<void>;
  cancel(key: string, timerId: string): Promise<void>;
  pending(key: string): Promise<ScheduledTimer[]>;
  /** The name prefix of the object's first write, or `null` when nothing was written yet. */
  namePrefix(): Promise<string | null>;
}
