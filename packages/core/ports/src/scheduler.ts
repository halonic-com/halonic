/** Version of the {@link Scheduler} port. A breaking change bumps it and comes with an ADR. */
export const schedulerVersion = 1;

/** A timer: a run's wait, timeout or retry, due at an ISO time. */
export interface ScheduledTimer {
  /** What the timer belongs to, usually a run id. At most 256 UTF-8 bytes. */
  key: string;
  /** Unique within its key. At most 256 UTF-8 bytes. */
  timerId: string;
  /**
   * ISO time the timer was set for, not the time it was delivered. The
   * listener compares it with its own state to drop late or repeated
   * deliveries.
   */
  at: string;
}

/**
 * What a scheduler calls. Adapters take it when they are created (see
 * {@link SchedulerFactory}), because on some runtimes the platform wakes the
 * code, not the code itself.
 *
 * **Timers can arrive late or twice**. The listener
 * ignores a timer it has already handled or cancelled.
 *
 * **A timer that comes due is delivered even while `onTimer` is still
 * running for another timer.** The engine relies on this: a harness call's
 * start limit is a timer that has to arrive while the call's own timer is
 * still being handled. A scheduler doesn't wait for one call to end before
 * it delivers the next timer.
 *
 * If `onTimer` rejects, the scheduler delivers the timer again later, waiting
 * longer each time: at least 1 second after the first failure, doubling, and
 * at most 15 minutes between tries. It never drops the timer, so a listener
 * that can't handle a timer resolves anyway (for example by failing the run)
 * rather than rejecting for ever.
 */
export interface SchedulerListener {
  /**
   * A timer is due. It is removed after this resolves, unless `schedule` set
   * the same key and id again while this ran (a retry, say): a timer set
   * during the call always stays as it was set, whether this resolves or
   * rejects. The retry wait after a rejection never replaces a time set
   * during the call.
   */
  onTimer(timer: ScheduledTimer): Promise<void>;
  /**
   * The routine tick, about once a minute, with the ISO time of the tick.
   * Ticks can be missed (a deploy, a laptop asleep), so the receiver works
   * out what is due from its last tick, with a catch-up policy. A tick that
   * rejects is not retried: the next tick catches up.
   */
  onTick(at: string): Promise<void>;
}

/**
 * Timers per key, kept outside memory so they survive restarts. The core
 * has no timers of its own: it asks the scheduler.
 */
export interface Scheduler {
  /**
   * Sets a timer, or moves it when the same key and id is already set. A time in the past is due at once.
   *
   * @throws RangeError when the key or timer id is longer than 256 UTF-8 bytes
   */
  schedule(key: string, timerId: string, at: string): Promise<void>;
  /** Removes a timer. Removing one that isn't set is not an error. */
  cancel(key: string, timerId: string): Promise<void>;
  /** The timers set for a key, earliest first. */
  pending(key: string): Promise<ScheduledTimer[]>;
}

/**
 * Creates a scheduler that calls `listener`. Every adapter has one, so a
 * contract suite builds them all the same way.
 *
 * The listener usually calls the run executor, which uses this scheduler, so
 * one of them has to be bound late: pass a listener that forwards to an
 * executor set after both are created.
 *
 * @example
 * let executor: RunExecutor | undefined;
 * const scheduler = createScheduler({
 *   onTimer: (timer) => engineStep(executor, timer),
 *   onTick: (at) => routineTick(executor, at),
 * });
 * executor = createLocalExecutor({ scheduler });
 */
export type SchedulerFactory = (listener: SchedulerListener) => Scheduler;
