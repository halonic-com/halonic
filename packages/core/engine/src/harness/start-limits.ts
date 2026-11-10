// The time limits on a harness call's two starts: the sandbox has to open,
// and the harness has to send its first event, each within its limit
// (failure path, rule 1). Core has no timers of its own, so the run side
// enforces them with the `Scheduler` port; a harness call only says what to
// wait for and how to fail.

/** Which start of a harness call a limit is on: the sandbox opening, or the harness's first event. */
export type StartPhase = "sandbox" | "harness";

/** How long the sandbox has to open, in milliseconds (HAL-189 plan decision 4). */
export const sandboxStartTimeoutMs = 30_000;

/** How long the harness has to send its first event, in milliseconds (HAL-189 plan decision 4). */
export const harnessStartTimeoutMs = 60_000;

/** The default limit of each start. */
export const defaultStartTimeoutsMs: Readonly<Record<StartPhase, number>> = {
  sandbox: sandboxStartTimeoutMs,
  harness: harnessStartTimeoutMs,
};

/** One start to wait for, with what happens when its time is up. */
export interface StartLimit<T> {
  readonly phase: StartPhase;
  readonly timeoutMs: number;
  /** Begins the wait. It's called only once the limit is set, so it can't outrun its timer. */
  start(): Promise<T>;
  /** The error the call fails with when the time is up. */
  timedOut(): Error;
  /**
   * Stops what `start` gives when it arrives after the time was up, such as
   * a sandbox session that opened too late. Without it, the late value is
   * dropped, because the caller stops it some other way.
   */
  late?(value: T): Promise<void>;
}

/** Puts time limits on a harness call's starts, so none of its waits goes on for ever. */
export interface StartLimits {
  /**
   * Waits for `limit.start()`.
   *
   * @throws the error of `limit.timedOut()` when the time is up first
   * @throws what `limit.start()` throws
   */
  within<T>(limit: StartLimit<T>): Promise<T>;
}
