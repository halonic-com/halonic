import type { ScheduledTimer, Scheduler, SchedulerListener } from "@halonicjs/ports";
import type { ControlledClock } from "./clock.ts";

/** What an adapter's test harness gives the scheduler suite. */
export interface SchedulerHarness {
  scheduler: Scheduler;
  /** The clock the scheduler reads; the suite moves it forward. */
  clock: ControlledClock;
  /**
   * Lets the scheduler deliver what is due by the clock now (timers, retries
   * and a tick when one is due) and resolves when those listener calls have
   * settled. On Cloudflare this would fire the alarms.
   */
  settle(): Promise<void>;
}

/** Creates a scheduler under test that calls `listener`. */
export type MakeScheduler = (listener: SchedulerListener) => Promise<SchedulerHarness>;

/** What the listener should do with one delivery: resolve, reject, or run something first. */
export type TimerBehaviour = (timer: ScheduledTimer, call: number) => Promise<void>;

/**
 * A listener that records every call, with the clock time it arrived, and
 * does what the test tells it to. A timer can arrive twice (multi-cloud ADR
 * 5.3), so `timers` can hold repeats: read it through {@link delivered}.
 */
export class RecordingListener implements SchedulerListener {
  readonly timers: ScheduledTimer[] = [];
  /** The clock time, in ms, at which each entry of `timers` arrived. */
  readonly arrivals: number[] = [];
  readonly ticks: string[] = [];
  behaviour: TimerBehaviour = async () => {};
  tickBehaviour: () => Promise<void> = async () => {};
  /** Reads the scheduler's clock; set by {@link startScheduler} once the harness exists. */
  now: () => number = () => Number.NaN;

  async onTimer(timer: ScheduledTimer): Promise<void> {
    this.timers.push({ ...timer });
    this.arrivals.push(this.now());
    await this.behaviour(timer, this.timers.length);
  }

  async onTick(at: string): Promise<void> {
    this.ticks.push(at);
    await this.tickBehaviour();
  }
}

/** A scheduler, its clock and listener, and a shortcut for "move the clock, then deliver". */
export async function startScheduler(make: MakeScheduler) {
  const listener = new RecordingListener();
  const harness = await make(listener);
  listener.now = () => harness.clock.now().getTime();
  const inMs = (ms: number) => new Date(harness.clock.now().getTime() + ms).toISOString();
  const wait = async (ms: number) => {
    harness.clock.advance(ms);
    await harness.settle();
  };
  return { ...harness, listener, inMs, wait };
}
