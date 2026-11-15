/**
 * The run and routines objects of the workerd specs: the real classes, with a clock the suite
 * sets and a listener and run list that answer to the suite (see `object-case.ts`), and the alarm
 * fired as Cloudflare would. They keep nothing in the suite's isolate, so the same specs run in a
 * local workerd and on Cloudflare, where every object has an isolate of its own.
 */

import type { SchedulerListener } from "@halonicjs/ports";
import { RoutinesObject } from "../routines-object.ts";
import { RunObject } from "../run-object.ts";
import type { RunListSink } from "../run-state.ts";
import { type CaseHooksStub, type CaseObject, ObjectCaseControl } from "./object-case.ts";

/** `RoutinesObject` reading the time the suite set and ticking the suite's listener. */
export class TestRoutinesObject extends RoutinesObject implements CaseObject {
  readonly #case = new ObjectCaseControl(this.ctx.storage);

  protected override clock = this.#case.clock;
  protected override tickListener(): SchedulerListener {
    return this.#case.hooks;
  }

  async setCase(clockMs: number, hooks: CaseHooksStub): Promise<void> {
    this.#case.setCase(clockMs, hooks);
  }
}

/** `RunObject` reading the time the suite set, and answering to the suite's listener and run list. */
export class TestRunObject extends RunObject implements CaseObject {
  readonly #case = new ObjectCaseControl(this.ctx.storage);
  #alarmRunning: Promise<void> = Promise.resolve();

  protected override clock = this.#case.clock;
  protected override nap = (_ms: number, signal: AbortSignal): Promise<void> =>
    this.#case.nextMove(signal);
  protected override timerListener(): SchedulerListener {
    return this.#case.hooks;
  }

  protected override runList(): RunListSink {
    return this.#case.hooks;
  }

  async setCase(clockMs: number, hooks: CaseHooksStub): Promise<void> {
    this.#case.setCase(clockMs, hooks);
  }

  /** Runs the alarm handler after any alarm still running, as Cloudflare never runs two at once. */
  override async alarm(): Promise<void> {
    const previous = this.#alarmRunning;
    const run = previous.then(() => super.alarm());
    this.#alarmRunning = run.catch(() => undefined);
    await run;
  }

  /** Fires the alarm when the one this object set is due by the clock the suite set. */
  async fireAlarm(): Promise<void> {
    const alarmAt = await this.ctx.storage.getAlarm();
    if (alarmAt !== null && alarmAt <= this.#case.clock.now().getTime()) {
      await this.alarm();
    }
  }
}
