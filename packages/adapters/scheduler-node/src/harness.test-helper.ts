import type { ScheduledTimer, SchedulerListener } from "@halonicjs/ports";
import { FlakyRecordStore, ManualClock, ManualTimers } from "./fakes.test-helper.ts";
import { NodeScheduler, type SchedulerErrorSource } from "./scheduler.ts";

/** A listener that records its calls and does what the test says. */
export class RecordingListener implements SchedulerListener {
  readonly timers: ScheduledTimer[] = [];
  readonly ticks: string[] = [];
  onTimerBehaviour: (timer: ScheduledTimer) => Promise<void> = async () => {};
  onTickBehaviour: () => Promise<void> = async () => {};

  async onTimer(timer: ScheduledTimer): Promise<void> {
    this.timers.push(timer);
    await this.onTimerBehaviour(timer);
  }

  async onTick(at: string): Promise<void> {
    this.ticks.push(at);
    await this.onTickBehaviour();
  }
}

/** What a test shares with the scheduler it started: the store, clock and timers. */
export interface World {
  store: FlakyRecordStore;
  clock: ManualClock;
  timers: ManualTimers;
}

/** A store, a clock at the fake start and fake timers on it. */
export function newWorld(): World {
  const clock = new ManualClock();
  return { store: new FlakyRecordStore(), clock, timers: new ManualTimers(clock) };
}

/**
 * Starts a scheduler in `world` and returns it with its listener, the errors
 * it reported, and `wait`: move the clock, fire the due wake-ups and let the
 * deliveries settle.
 */
export function startScheduler(world: World = newWorld()) {
  const listener = new RecordingListener();
  const errors: { error: unknown; source: SchedulerErrorSource }[] = [];
  const scheduler = new NodeScheduler(listener, {
    store: world.store,
    clock: world.clock,
    setTimer: world.timers.setTimer,
    reportError: (error, source) => errors.push({ error, source }),
  });
  const inMs = (ms: number) => new Date(world.clock.now().getTime() + ms).toISOString();
  const wait = async (ms: number) => {
    world.clock.advance(ms);
    world.timers.fireDue();
    await scheduler.deliverDue();
  };
  return { ...world, world, scheduler, listener, errors, inMs, wait };
}

/** A listener behaviour that always rejects. */
export async function fail(): Promise<void> {
  throw new Error("listener failed");
}
