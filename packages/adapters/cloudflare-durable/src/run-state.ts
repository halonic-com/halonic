import type { RunEvent } from "@halonicjs/events";
import type {
  AppendOptions,
  AppendResult,
  RunSnapshot,
  ScheduledTimer,
  SchedulerListener,
} from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import { RunLog } from "./run-log.ts";
import type { RunObjectApi } from "./run-object-api.ts";
import type { RunSql } from "./run-sql.ts";
import { TimerDelivery } from "./timer-delivery.ts";
import { TimerTable } from "./timer-table.ts";

/** Where the object's one alarm is kept: a Durable Object's storage, or a fake in tests. */
export interface AlarmSlot {
  /** Sets the alarm to a time in ms since 1970, replacing the one set; a past time fires at once. */
  set(atMs: number): Promise<void>;
  /** Removes the alarm. */
  clear(): Promise<void>;
}

/** What a {@link RunState} needs. Each is read at the time of use, so a test can change it. */
export interface RunStateOptions {
  sql: RunSql;
  alarm: AlarmSlot;
  clock: () => Clock;
  nap: (ms: number, signal: AbortSignal) => Promise<void>;
  listener: () => Pick<SchedulerListener, "onTimer">;
}

/**
 * One run's log and timers, and the alarm that delivers the timers, over
 * storage the caller gives. `RunObject` runs it inside a Durable Object;
 * the Node tests run it over `node:sqlite`.
 *
 * The one alarm is always set to the earliest time a timer is due. When it
 * fires, {@link RunState.alarm} delivers what is due and sets the alarm
 * again, also when delivery failed, so a failure never leaves timers without one.
 */
export class RunState implements RunObjectApi {
  readonly #log: RunLog;
  readonly #timers: TimerTable;
  readonly #delivery: TimerDelivery;
  readonly #alarm: AlarmSlot;

  constructor(options: RunStateOptions) {
    this.#log = new RunLog(options.sql);
    this.#timers = new TimerTable(options.sql);
    this.#alarm = options.alarm;
    this.#delivery = new TimerDelivery({
      table: this.#timers,
      listener: { onTimer: (timer) => options.listener().onTimer(timer) },
      clock: { now: () => options.clock().now() },
      nap: (ms, signal) => options.nap(ms, signal),
    });
  }

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options?: AppendOptions,
  ): Promise<AppendResult> {
    return this.#log.append(runId, expectedSeq, events, options);
  }

  async events(afterSeq?: number): Promise<RunEvent[]> {
    return this.#log.events(afterSeq);
  }

  async snapshot(): Promise<RunSnapshot | null> {
    return this.#log.snapshot();
  }

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    this.#timers.set(key, timerId, at);
    await this.#setAlarm();
  }

  async cancel(key: string, timerId: string): Promise<void> {
    this.#timers.cancel(key, timerId);
    await this.#setAlarm();
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return this.#timers.pending(key);
  }

  /** Delivers the timers that are due, then sets the alarm again whether delivery worked or not. */
  async alarm(): Promise<void> {
    try {
      await this.#delivery.deliverDueTimers();
    } finally {
      await this.#setAlarm();
    }
  }

  /** Sets the one alarm to the earliest due time, or removes it when no timer is left. */
  async #setAlarm(): Promise<void> {
    const dueAtMs = this.#timers.earliestDueMs();
    if (dueAtMs === null) {
      await this.#alarm.clear();
    } else {
      await this.#alarm.set(dueAtMs);
    }
  }
}
