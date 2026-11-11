# @halonicjs/adapter-scheduler-node

The `Scheduler` port on Node: timers per key that survive a restart, the
retry back-off when the listener rejects, and the routine tick about once a
minute. For `halonic serve` and the desktop app, where one Node process runs
the engine.

- **Layer:** adapters
- **Owner:** priya
- **Public API:** `@halonicjs/adapter-scheduler-node`

## Where the timers are kept

In a `RecordStore` collection (`halonic.scheduler.timers` unless you pass
another), one record per key and timer id, with its set time, failure count
and next try. The package holds no file code: the store decides where the
records go. Every change is written to the store before the scheduler's
memory changes, one change at a time, so a restart never loses a timer a
caller was told is set. The one exception: when the store fails to record a
delivery, the timer's retry wait is kept in memory only, and the store keeps
the earlier try. A delivery that a restart cuts off is delivered
again, which the port allows (timers can arrive twice).

The clock and the timer function are passed in, so tests run on fake time.

## Example

A timer that survives a restart. The code lives in
[`examples/timers-that-survive-a-restart.ts`](examples/timers-that-survive-a-restart.ts), where it is
typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/adapter-scheduler-node` as below. The example keeps its timers in the memory adapter's
store; on a server, pass the real store and `systemSetTimer`.

```ts
import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { nodeSchedulerFactory } from "@halonicjs/adapter-scheduler-node";

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
```

## Behaviour

- **Due:** a timer is delivered once the clock reaches its time, with the
  time it was set for. A time in the past is due at once.
- **Retries:** when `onTimer` rejects, the timer comes again 1 s later,
  doubling up to 15 min, and is never dropped. A timer the listener sets again
  or cancels during the call stays as the listener left it.
- **Tick:** `onTick` about once a minute. A long gap gives one tick, not one
  per missed minute: the listener catches up. A tick that rejects isn't retried.
- **Input rules:** a key or timer id over 256 UTF-8 bytes, or a time that
  isn't a valid time, makes `schedule` reject with a `RangeError` and change
  nothing.
- **Wake-ups:** the scheduler wakes itself with `setTimer`, set for the earlier
  of the next due timer and the next tick, so nothing has to call it. It sets
  the next wake-up as a delivery starts and again as each one settles, so one
  slow listener call holds back no other timer. A timer or tick still being
  delivered is left out of the wake-up, so an overdue one can't wake the
  scheduler in a loop; a tick that is still running when the next is due waits
  for it to settle and then starts the next at once (requirement
  `scheduler-node.slow-delivery`). After `close` it sets no more wake-ups and
  delivers nothing more, and `close` resolves once the deliveries in progress
  have settled.
- **Failed wake-ups:** a wake-up that fails is reported as `"wake-up"`, and
  the next one waits as a timer's retry would: 1 second, doubling up to 15
  minutes, or longer when nothing is due sooner. After each wake-up that
  worked, the scheduler calls `onWokeUp`, so a caller that counts failed
  wake-ups can start again.
- **Store failures during a delivery:** when the store fails to record how a
  delivery went, the error is reported with the timer as its source, and the
  timer is delivered again after a retry's wait (1 second, doubling up to 15
  minutes), not at once.
- **Start-up:** the scheduler compacts the collection when it starts, so
  delivered, cancelled and replaced timers leave the store. If the store
  fails the compaction, it still starts from the timers it read and reports
  no error.
- **Foreign records:** when the collection holds a record that isn't a timer
  this scheduler wrote, every call rejects with an error that names the
  record, nothing is delivered, and the collection is left as it is.
- **Errors:** every error the scheduler handles itself goes to `reportError`,
  with the timer, `"tick"` or `"wake-up"` as its source.
- **One process, one scheduler:** memory is the scheduler's working copy,
  so two processes must not share one collection. The schedulers a
  `nodeSchedulerFactory` creates all use its one collection, so only one of
  them may be live at a time.
