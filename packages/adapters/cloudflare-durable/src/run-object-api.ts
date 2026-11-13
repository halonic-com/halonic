import type { RunEvent } from "@halonicjs/events";
import type { AppendOptions, AppendResult, RunSnapshot, ScheduledTimer } from "@halonicjs/ports";

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
  schedule(key: string, timerId: string, at: string): Promise<void>;
  cancel(key: string, timerId: string): Promise<void>;
  pending(key: string): Promise<ScheduledTimer[]>;
}
