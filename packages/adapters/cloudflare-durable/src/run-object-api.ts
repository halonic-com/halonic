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
 */
export interface RunObjectApi {
  append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options?: AppendOptions,
  ): Promise<AppendResult>;
  events(afterSeq?: number): Promise<RunEvent[]>;
  snapshot(): Promise<RunSnapshot | null>;
  /** The run's summary, worked out from its log, or `null` for a log that is empty. */
  summary(): Promise<RunSummary | null>;
  /** How the run is moving, for the watchdog. */
  health(): Promise<RunHealth>;
  schedule(key: string, timerId: string, at: string): Promise<void>;
  cancel(key: string, timerId: string): Promise<void>;
  pending(key: string): Promise<ScheduledTimer[]>;
}
