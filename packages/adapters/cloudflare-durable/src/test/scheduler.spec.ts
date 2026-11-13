/**
 * The `Scheduler` contract against `DurableScheduler` and the real `RunObject`
 * alarm, inside workerd. The suite moves a clock the objects read. It starts
 * ten years ahead of real time, so workerd never fires an alarm by itself
 * before the suite asks (an alarm in the real past would fire at once, and
 * that is fine too: the handler only delivers what the suite's clock says is due).
 *
 * "Fire the alarm" is what `settle()` does for every object the scheduler
 * touched: it runs the object's `alarm()` handler when the alarm the object
 * itself set is due by the suite's clock, as Cloudflare would at that time.
 * Alarms run one at a time, as on Cloudflare. The routine tick is the cron's
 * (build plan part 7), so `settle()` also delivers it, as the cron would.
 */

import { env } from "cloudflare:workers";
import type { SchedulerListener } from "@halonicjs/ports";
import { type ControlledClock, schedulerContract } from "@halonicjs/testing-contracts";
import { DurableScheduler } from "../durable-scheduler.ts";
import { RunObject } from "../run-object.ts";

/** What the runner binds for this suite (see `scheduler.test.ts`). */
interface TestEnv {
  RUNS: DurableObjectNamespace<TestRunObject>;
}

/** A clock that only moves when the suite moves it, and tells the loops that wait on it. */
class SuiteClock implements ControlledClock {
  #now = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
  readonly #wakers = new Set<() => void>();

  now(): Date {
    return new Date(this.#now);
  }

  advance(ms: number): void {
    this.#now += ms;
    for (const wake of this.#wakers) wake();
  }

  /** Resolves when the clock next moves, or when `signal` aborts. */
  nextMove(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const wake = () => {
        this.#wakers.delete(wake);
        resolve();
      };
      this.#wakers.add(wake);
      signal.addEventListener("abort", wake);
    });
  }
}

/** One scheduler under test: what its objects read, and the objects it has touched. */
interface Case {
  clock: SuiteClock;
  listener: SchedulerListener;
  objectNames: Set<string>;
}

/** Object names start with the case's id, so each case has objects of its own. */
const caseIdLength = 36; // the length of a UUID
const cases = new Map<string, Case>();

/** `RunObject` reading the time and the listener of the case its name belongs to. */
export class TestRunObject extends RunObject {
  #alarmRunning: Promise<void> = Promise.resolve();

  #case(): Case {
    const name = this.ctx.id.name ?? "";
    const found = cases.get(name.slice(0, caseIdLength));
    if (found === undefined) throw new Error("This test object was not made through make().");
    found.objectNames.add(name);
    return found;
  }

  protected override clock = { now: (): Date => this.#case().clock.now() };
  protected override nap = (_ms: number, signal: AbortSignal): Promise<void> =>
    this.#case().clock.nextMove(signal);
  protected override timerListener(): SchedulerListener {
    return this.#case().listener;
  }

  override async schedule(key: string, timerId: string, at: string): Promise<void> {
    this.#case();
    await super.schedule(key, timerId, at);
  }

  /** Runs the alarm handler after any alarm still running, as Cloudflare never runs two at once. */
  override async alarm(): Promise<void> {
    const previous = this.#alarmRunning;
    const run = previous.then(() => super.alarm());
    this.#alarmRunning = run.catch(() => undefined);
    await run;
  }

  /** Fires the alarm when the one this object set is due by the suite's clock. */
  async fireAlarm(): Promise<void> {
    const alarmAt = await this.ctx.storage.getAlarm();
    if (alarmAt !== null && alarmAt <= this.#case().clock.now().getTime()) {
      await this.alarm();
    }
  }
}

schedulerContract("durable object", async (listener) => {
  const caseId = crypto.randomUUID();
  const clock = new SuiteClock();
  const objectNames = new Set<string>();
  cases.set(caseId, { clock, listener, objectNames });
  const { RUNS } = env as TestEnv;
  const scheduler = new DurableScheduler({ namespace: RUNS, namePrefix: caseId });
  return {
    scheduler,
    clock,
    async settle() {
      await Promise.all(
        [...objectNames].map((name) => RUNS.get(RUNS.idFromName(name)).fireAlarm()),
      );
      // A tick that rejects is not retried: the next tick catches up.
      await listener.onTick(clock.now().toISOString()).catch(() => undefined);
    },
  };
});
