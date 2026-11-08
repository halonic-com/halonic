import type {
  Clock,
  RecordStore,
  ScheduledTimer,
  Scheduler,
  SchedulerListener,
} from "@halonicjs/ports";
import type { CancelTimer, SetTimer } from "./set-timer.ts";
import { failedTimer, freshTimer, type StoredTimer, timerSlot } from "./stored-timer.ts";
import { TimerLog } from "./timer-log.ts";

const maxIdBytes = 256;
const tickEveryMs = 60_000;
const firstRetryMs = 1000;
const maxRetryMs = 15 * 60_000;

/** The collection the timers are kept in when no other is given. */
export const defaultTimerCollection = "halonic.scheduler.timers";

/** What went wrong where, for {@link NodeSchedulerOptions.reportError}. */
export type SchedulerErrorSource = ScheduledTimer | "tick" | "wake-up";

/** What a {@link NodeScheduler} needs. */
export interface NodeSchedulerOptions {
  /** Where the timers are kept, so they survive a restart. */
  store: RecordStore;
  /** The collection in `store` that holds the timers; one per scheduler. */
  collection?: string;
  /** The time; timers are due by this clock. */
  clock: Clock;
  /** How the scheduler wakes itself up; `systemSetTimer` on a real server. */
  setTimer: SetTimer;
  /**
   * Hears every error the scheduler handles itself: a listener that rejects
   * (the timer is retried, the tick isn't), a store that fails while a
   * delivery is recorded, or a wake-up that fails. Nothing is thrown away
   * silently, and nothing here stops the scheduler.
   */
  reportError: (error: unknown, source: SchedulerErrorSource) => void;
}

/**
 * The {@link Scheduler} port on Node. Timers live in memory for speed and in
 * a {@link RecordStore} collection for restarts: every change is written to
 * the store before memory changes, one change at a time, so the store never
 * lags behind what a caller was told. One wake-up timer is set for the next
 * due timer or tick, whichever comes first.
 *
 * Timers arrive at least once: a timer whose delivery was cut off by a
 * restart is delivered again by the next scheduler.
 */
export class NodeScheduler implements Scheduler {
  readonly #listener: SchedulerListener;
  readonly #clock: Clock;
  readonly #log: TimerLog;
  readonly #setTimer: SetTimer;
  readonly #reportError: NodeSchedulerOptions["reportError"];
  /** The timers once they are loaded from the store. */
  readonly #loaded: Promise<Map<string, StoredTimer>>;
  #timers: Map<string, StoredTimer> | undefined;
  /** Deliveries in progress, by timer slot; a timer is never delivered twice at once. */
  readonly #deliveries = new Map<string, Promise<void>>();
  #tickInProgress: Promise<void> | undefined;
  #nextTickAt: number;
  /** The end of the queue of changes; each change waits for the one before. */
  #lastChange: Promise<void> = Promise.resolve();
  #cancelWakeUp: CancelTimer | undefined;
  #closed = false;

  constructor(listener: SchedulerListener, options: NodeSchedulerOptions) {
    this.#listener = listener;
    this.#clock = options.clock;
    this.#setTimer = options.setTimer;
    this.#reportError = options.reportError;
    this.#log = new TimerLog(
      options.store,
      options.collection ?? defaultTimerCollection,
      this.#clock,
    );
    this.#nextTickAt = this.#clock.now().getTime() + tickEveryMs;
    this.#loaded = this.#log.load();
    this.#loaded.then(
      (timers) => {
        this.#timers = timers;
        this.#armWakeUp();
      },
      // Every call rejects with the same error too; this is the only place a
      // load failure shows up when nobody calls.
      (error: unknown) => this.#reportError(error, "wake-up"),
    );
  }

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    checkIdLength("key", key);
    checkIdLength("timer id", timerId);
    if (Number.isNaN(Date.parse(at))) {
      throw new RangeError(`Timer time ${JSON.stringify(at)} is not a valid time.`);
    }
    await this.#change(async (timers) => {
      const slot = timerSlot(key, timerId);
      const stored = freshTimer(key, timerId, at);
      await this.#log.put(stored, !timers.has(slot));
      timers.set(slot, stored);
    });
  }

  async cancel(key: string, timerId: string): Promise<void> {
    await this.#change(async (timers) => {
      const slot = timerSlot(key, timerId);
      if (!timers.has(slot)) return;
      await this.#log.remove(key, timerId);
      timers.delete(slot);
    });
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    const timers = await this.#loaded;
    return [...timers.values()]
      .filter((stored) => stored.timer.key === key)
      .map((stored) => ({ ...stored.timer }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.timerId.localeCompare(b.timerId));
  }

  /**
   * Delivers every timer due by the clock now, and the tick when it is due,
   * then resolves once those deliveries and any already in progress have
   * settled. The wake-up timer calls this; tests call it to let time pass.
   */
  async deliverDue(): Promise<void> {
    const timers = await this.#loaded;
    if (this.#closed) return;
    const now = this.#clock.now().getTime();
    const due = [...timers].filter(
      ([slot, stored]) => stored.dueAt <= now && !this.#deliveries.has(slot),
    );
    for (const [slot, stored] of due) {
      this.#startDelivery(slot, stored);
    }
    if (now >= this.#nextTickAt && this.#tickInProgress === undefined) {
      this.#startTick(now);
    }
    await Promise.all([...this.#deliveries.values(), this.#tickInProgress]);
    this.#armWakeUp();
  }

  /** Stops waking up and delivering, and resolves when the deliveries in progress have settled. */
  async close(): Promise<void> {
    this.#closed = true;
    this.#cancelWakeUp?.();
    this.#cancelWakeUp = undefined;
    await Promise.all([...this.#deliveries.values(), this.#tickInProgress]);
  }

  #startDelivery(slot: string, stored: StoredTimer): void {
    const delivery = this.#deliver(slot, stored)
      .catch((error: unknown) => this.#reportError(error, stored.timer))
      .finally(() => this.#deliveries.delete(slot));
    this.#deliveries.set(slot, delivery);
  }

  /**
   * Calls the listener, then removes the timer, or sets its retry when the
   * listener rejected. A timer set again or cancelled during the call is a
   * different object afterwards (or none), and stays as the listener left it.
   */
  async #deliver(slot: string, stored: StoredTimer): Promise<void> {
    let failed = false;
    try {
      await this.#listener.onTimer({ ...stored.timer });
    } catch (error) {
      failed = true;
      this.#reportError(error, stored.timer);
    }
    await this.#change(async (timers) => {
      if (timers.get(slot) !== stored) return;
      if (!failed) {
        await this.#log.remove(stored.timer.key, stored.timer.timerId);
        timers.delete(slot);
        return;
      }
      const retryAt = this.#clock.now().getTime() + retryWait(stored.failures + 1);
      const retry = failedTimer(stored, retryAt);
      await this.#log.put(retry, false);
      timers.set(slot, retry);
    });
  }

  #startTick(now: number): void {
    this.#nextTickAt = now + tickEveryMs;
    // A tick that rejects is not retried (port rule): the next one catches up.
    this.#tickInProgress = this.#listener
      .onTick(new Date(now).toISOString())
      .catch((error: unknown) => this.#reportError(error, "tick"))
      .finally(() => {
        this.#tickInProgress = undefined;
      });
  }

  /** Runs one change to the timers after the changes before it, then moves the wake-up. */
  async #change(apply: (timers: Map<string, StoredTimer>) => Promise<void>): Promise<void> {
    const timers = await this.#loaded;
    const run = this.#lastChange.then(() => apply(timers));
    // The next change waits for this one whether or not it fails; the caller
    // still gets this one's error.
    this.#lastChange = run.catch(() => undefined);
    await run;
    this.#armWakeUp();
  }

  /** Sets the one wake-up timer for the next due timer or tick, replacing the one before. */
  #armWakeUp(): void {
    if (this.#closed || this.#timers === undefined) return;
    this.#cancelWakeUp?.();
    let wakeAt = this.#nextTickAt;
    for (const [slot, stored] of this.#timers) {
      if (!this.#deliveries.has(slot)) wakeAt = Math.min(wakeAt, stored.dueAt);
    }
    // The tick is at most a minute away, so the delay always fits setTimeout.
    const delayMs = Math.max(0, wakeAt - this.#clock.now().getTime());
    this.#cancelWakeUp = this.#setTimer(() => {
      this.#cancelWakeUp = undefined;
      this.deliverDue().catch((error: unknown) => this.#reportError(error, "wake-up"));
    }, delayMs);
  }
}

/** Creates Node schedulers that share `options`, as a `SchedulerFactory`. */
export function nodeSchedulerFactory(
  options: NodeSchedulerOptions,
): (listener: SchedulerListener) => NodeScheduler {
  return (listener) => new NodeScheduler(listener, options);
}

/** 1 second after the first failure, doubling, at most 15 minutes (the port's retry rule). */
export function retryWait(failures: number): number {
  return Math.min(firstRetryMs * 2 ** (failures - 1), maxRetryMs);
}

function checkIdLength(what: string, value: string): void {
  if (new TextEncoder().encode(value).byteLength > maxIdBytes) {
    throw new RangeError(`A timer ${what} is at most ${maxIdBytes} UTF-8 bytes.`);
  }
}
