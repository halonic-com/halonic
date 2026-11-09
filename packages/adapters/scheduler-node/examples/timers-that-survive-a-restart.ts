import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { nodeSchedulerFactory } from "../src/index.ts";

/** Sets a timer, restarts the scheduler on the same store, and gets the timer delivered. */
export async function runExample(): Promise<{
  pendingBeforeRestart: string[];
  deliveredBeforeDue: string[];
  deliveredWhenDue: string[];
  pendingAfterDelivery: number;
  errors: number;
}> {
  // The store keeps the timers; the clock is passed in, so the example moves time by hand.
  const store = new MemoryRecordStore();
  const clock = new ManualClock("2026-11-09T07:00:00.000Z");
  const errors: unknown[] = [];
  const createScheduler = nodeSchedulerFactory({
    store,
    clock,
    // A server passes `systemSetTimer` here; this example wakes the scheduler itself.
    setTimer: () => () => {},
    reportError: (error) => errors.push(error),
  });

  const delivered: string[] = [];
  const listener = {
    onTimer: async (timer: { key: string; timerId: string }) => {
      delivered.push(`${timer.key}/${timer.timerId}`);
    },
    onTick: async () => {},
  };

  // A timer is set, then the process stops. The timer is already in the store.
  const first = createScheduler(listener);
  await first.schedule("run_1", "wait", "2026-11-09T08:00:00.000Z");
  const pendingBeforeRestart = (await first.pending("run_1")).map((timer) => timer.timerId); // ["wait"]
  await first.close();

  // A new scheduler on the same store loads the timer. Nothing is delivered before its time.
  const second = createScheduler(listener);
  await second.deliverDue();
  const deliveredBeforeDue = [...delivered]; // []

  // One hour later the timer is due, and it is delivered once and removed.
  clock.advance(60 * 60_000);
  await second.deliverDue();
  const deliveredWhenDue = [...delivered]; // ["run_1/wait"]
  const pendingAfterDelivery = (await second.pending("run_1")).length; // 0

  // On shutdown: stop waking up and let deliveries in progress finish.
  await second.close();
  return {
    pendingBeforeRestart,
    deliveredBeforeDue,
    deliveredWhenDue,
    pendingAfterDelivery,
    errors: errors.length,
  };
}
