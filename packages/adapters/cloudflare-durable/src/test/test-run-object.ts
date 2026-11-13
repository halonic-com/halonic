/**
 * What the workerd specs of the run object share: a clock the suite moves, the registry that lets
 * a `RunObject` find the suite case its name belongs to, and the object itself, with the alarm
 * fired as Cloudflare would. The suite and the objects run in one workerd isolate, so a map in
 * this module reaches both.
 */

import type { SchedulerListener } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import { RoutinesObject } from "../routines-object.ts";
import { RunObject } from "../run-object.ts";
import type { RunListSink } from "../run-state.ts";

/** A clock that only moves when the suite moves it, and tells the loops that wait on it. */
export class SuiteClock implements Clock {
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

/** One store or scheduler under test: what its objects read, and the objects it has touched. */
export interface Case {
  clock: SuiteClock;
  listener: SchedulerListener;
  runList: RunListSink;
  objectNames: Set<string>;
}

/** Object names start with the case's id, so each case has objects of its own. */
const caseIdLength = 36; // the length of a UUID
export const cases = new Map<string, Case>();

/** The case an object's name belongs to; the name starts with the case's id. */
function caseOfName(name: string | undefined): Case {
  const found = cases.get((name ?? "").slice(0, caseIdLength));
  if (found === undefined) throw new Error("This test object was not made through make().");
  return found;
}

/** `RoutinesObject` reading the time and the listener of the case its name is. */
export class TestRoutinesObject extends RoutinesObject {
  protected override clock = { now: (): Date => caseOfName(this.ctx.id.name).clock.now() };
  protected override tickListener(): SchedulerListener {
    return caseOfName(this.ctx.id.name).listener;
  }
}

/** `RunObject` reading the time and the listener of the case its name belongs to. */
export class TestRunObject extends RunObject {
  #alarmRunning: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.#case();
  }

  #case(): Case {
    const name = this.ctx.id.name ?? "";
    const found = caseOfName(name);
    found.objectNames.add(name);
    return found;
  }

  protected override clock = { now: (): Date => this.#case().clock.now() };
  protected override nap = (_ms: number, signal: AbortSignal): Promise<void> =>
    this.#case().clock.nextMove(signal);
  protected override timerListener(): SchedulerListener {
    return this.#case().listener;
  }

  protected override runList(): RunListSink {
    return this.#case().runList;
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
