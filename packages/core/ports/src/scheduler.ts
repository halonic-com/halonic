/** Version of the {@link Scheduler} port. A breaking change bumps it and comes with an ADR. */
export const schedulerVersion = 1;

/** A timer: a run's wait, timeout or retry, due at an ISO time. */
export interface ScheduledTimer {
  /** What the timer belongs to, usually a run id. */
  key: string;
  /** Unique within its key. */
  timerId: string;
  /** ISO time it is due. */
  at: string;
}

/**
 * What a scheduler calls. Adapters take it when they are created, because on
 * some runtimes the platform wakes the code, not the code itself.
 *
 * **Timers can arrive late or twice** (multi-cloud ADR 5.3). The listener
 * ignores a timer it has already handled or cancelled. If `onTimer` rejects,
 * the scheduler delivers the timer again later.
 */
export interface SchedulerListener {
  /** A timer is due. It is removed only after this resolves. */
  onTimer(timer: ScheduledTimer): Promise<void>;
  /**
   * The routine tick, about once a minute, with the ISO time of the tick.
   * Ticks can be missed (a deploy, a laptop asleep), so the receiver works
   * out what is due from its last tick, with a catch-up policy.
   */
  onTick(at: string): Promise<void>;
}

/**
 * Timers per key, kept outside memory so they survive restarts. The core
 * has no timers of its own (multi-cloud ADR 9): it asks the scheduler.
 */
export interface Scheduler {
  /** Sets a timer, or moves it when the same key and id is already set. A time in the past is due at once. */
  schedule(key: string, timerId: string, at: string): Promise<void>;
  /** Removes a timer. Removing one that isn't set is not an error. */
  cancel(key: string, timerId: string): Promise<void>;
  /** The timers set for a key, earliest first. */
  pending(key: string): Promise<ScheduledTimer[]>;
}
