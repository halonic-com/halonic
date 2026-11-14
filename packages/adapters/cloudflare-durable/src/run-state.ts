import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import type {
  AppendOptions,
  AppendResult,
  RunSnapshot,
  ScheduledTimer,
  SchedulerListener,
} from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import { RunLog } from "./run-log.ts";
import type { RunHealth, RunObjectApi } from "./run-object-api.ts";
import { RunOutbox } from "./run-outbox.ts";
import type { RunSql } from "./run-sql.ts";
import { TimerDelivery } from "./timer-delivery.ts";
import { TimerTable } from "./timer-table.ts";

/** The events that end a run (see `summarize`): nothing follows them. */
const endingEventTypes: ReadonlySet<string> = new Set([
  "run.completed",
  "run.failed",
  "run.cant-try",
]);

/** Where the object's one alarm is kept: a Durable Object's storage, or a fake in tests. */
export interface AlarmSlot {
  /** Sets the alarm to a time in ms since 1970, replacing the one set; a past time fires at once. */
  set(atMs: number): Promise<void>;
  /** Removes the alarm. */
  clear(): Promise<void>;
}

/** Where run summaries are sent for the run list. `D1RunList` fits. */
export interface RunListSink {
  /** Records the run's summary as of its event `seq`; repeating or sending an older one is harmless. */
  publish(summary: RunSummary, seq: number): Promise<void>;
}

/** What a {@link RunState} needs. Each is read at the time of use, so a test can change it. */
export interface RunStateOptions {
  sql: RunSql;
  alarm: AlarmSlot;
  clock: () => Clock;
  nap: (ms: number, signal: AbortSignal) => Promise<void>;
  listener: () => Pick<SchedulerListener, "onTimer">;
  runList: () => RunListSink;
}

/**
 * One run's log and timers, and the alarm that delivers the timers, over
 * storage the caller gives. `RunObject` runs it inside a Durable Object;
 * the Node tests run it over `node:sqlite`.
 *
 * The one alarm is always set to the earliest time a timer is due or a run
 * list update is due. When it fires, {@link RunState.alarm} delivers what is
 * due, sends the run list update, and sets the alarm again, also when either
 * failed, so a failure never leaves work without an alarm.
 *
 * Every append notes in the outbox, in its own transaction, that the run
 * list is behind. The update is sent from the alarm, so a slow or failing D1
 * never slows or fails an append; it is retried with the timers' backoff.
 *
 * An append whose alarm can't be set throws although it is stored; the caller's retry then gets
 * `conflict`, and the next alarm sends the update all the same.
 */
export class RunState implements RunObjectApi {
  readonly #log: RunLog;
  readonly #timers: TimerTable;
  readonly #delivery: TimerDelivery;
  readonly #outbox: RunOutbox;
  readonly #alarm: AlarmSlot;
  readonly #options: RunStateOptions;
  /** Wakes the send loop of a running alarm, so an append made during a timer's call is sent. */
  #wakeSendLoop: () => void = () => {};

  constructor(options: RunStateOptions) {
    this.#options = options;
    this.#outbox = new RunOutbox(options.sql);
    this.#log = new RunLog(options.sql, (lastSeq) => this.#outbox.mark(lastSeq, this.#nowMs()));
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
    const result = this.#log.append(runId, expectedSeq, events, options);
    if (result.ok) {
      this.#wakeSendLoop();
      await this.#setAlarm();
    }
    return result;
  }

  async events(afterSeq?: number): Promise<RunEvent[]> {
    return this.#log.events(afterSeq);
  }

  async snapshot(): Promise<RunSnapshot | null> {
    return this.#log.snapshot();
  }

  async summary(): Promise<RunSummary | null> {
    return summarize(this.#log.events());
  }

  async health(): Promise<RunHealth> {
    const earliestDueMs = this.#timers.earliestDueMs();
    const lastEvent = this.#log.lastEvent();
    return {
      lastEventAt: lastEvent?.at ?? null,
      ended: lastEvent !== null && endingEventTypes.has(lastEvent.type),
      overdueMs: earliestDueMs === null ? 0 : Math.max(0, this.#nowMs() - earliestDueMs),
    };
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

  /**
   * Delivers the timers that are due and sends the run list updates that are due, each whether
   * the other worked or not, then sets the alarm again. The first failure is thrown after that.
   * Updates keep being sent while a timer's call runs: the next alarm can't start until this one
   * returns, and a call can take minutes.
   */
  async alarm(): Promise<void> {
    const delivering = this.#delivery.deliverDueTimers();
    const outcomes = await Promise.allSettled([delivering, this.#sendUntilSettled(delivering)]);
    await this.#setAlarm();
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") throw outcome.reason;
    }
  }

  /**
   * Sends the update whenever the outbox has one due, until `delivering` is over. Between sends it
   * waits for an append, for the entry's next try to come due, or for the end of the delivery.
   */
  async #sendUntilSettled(delivering: Promise<void>): Promise<void> {
    let over = false;
    const end = delivering.then(
      () => {
        over = true;
      },
      () => {
        over = true;
      },
    );
    for (;;) {
      await this.#sendRunListUpdate();
      if (over) return;
      const entry = this.#outbox.entry();
      const stopNapping = new AbortController();
      const waits = [end, new Promise<void>((wake) => (this.#wakeSendLoop = wake))];
      if (entry !== null) {
        waits.push(
          this.#options.nap(Math.max(0, entry.dueAtMs - this.#nowMs()), stopNapping.signal),
        );
      }
      await Promise.race(waits);
      stopNapping.abort();
    }
  }

  /** Sends the run's summary to the run list when the outbox says it is behind, and its try is due. */
  async #sendRunListUpdate(): Promise<void> {
    const entry = this.#outbox.entry();
    if (entry === null || entry.dueAtMs > this.#nowMs()) return;
    const events = this.#log.events();
    const summary = summarize(events);
    try {
      if (summary !== null) {
        await this.#options.runList().publish(summary, this.#log.lastSeq());
      }
    } catch {
      this.#outbox.failed(entry, this.#nowMs());
      return;
    }
    this.#outbox.sent(entry.seq);
  }

  #nowMs(): number {
    return this.#options.clock().now().getTime();
  }

  /** Sets the one alarm to the earliest due time, or removes it when nothing is left to do. */
  async #setAlarm(): Promise<void> {
    const dueTimes = [this.#timers.earliestDueMs(), this.#outbox.entry()?.dueAtMs ?? null];
    const dueAtMs = Math.min(...dueTimes.filter((time): time is number => time !== null));
    if (Number.isFinite(dueAtMs)) {
      await this.#alarm.set(dueAtMs);
    } else {
      await this.#alarm.clear();
    }
  }
}
