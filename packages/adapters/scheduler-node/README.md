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
caller was told is set. A delivery that a restart cuts off is delivered
again, which the port allows (timers can arrive twice).

The clock and the timer function are passed in, so tests run on fake time.

## Example

```ts
import { nodeSchedulerFactory, systemSetTimer } from "@halonicjs/adapter-scheduler-node";

const createScheduler = nodeSchedulerFactory({
  store: recordStore,
  clock: { now: () => new Date() },
  setTimer: systemSetTimer,
  reportError: (error, source) => log.warn("scheduler", source, error),
});
const scheduler = createScheduler({
  onTimer: (timer) => engineStep(executor, timer),
  onTick: (at) => routineTick(executor, at),
});
await scheduler.schedule("run_1", "wait", "2026-11-09T08:00:00.000Z");
// On shutdown: stop waking up and let deliveries in progress finish.
await scheduler.close();
```

## Behaviour

- **Due:** a timer is delivered once the clock reaches its time, with the
  time it was set for. A time in the past is due at once.
- **Retries:** when `onTimer` rejects, the timer comes again 1 s later,
  doubling up to 15 min, and is never dropped. A timer the listener sets again
  or cancels during the call stays as the listener left it.
- **Tick:** `onTick` about once a minute. A long gap gives one tick, not one
  per missed minute: the listener catches up. A tick that rejects isn't retried.
- **Errors:** every error the scheduler handles itself goes to `reportError`,
  with the timer, `"tick"` or `"wake-up"` as its source.
- **One process, one scheduler:** memory is the scheduler's working copy,
  so two processes must not share one collection. The schedulers a
  `nodeSchedulerFactory` creates all use its one collection, so only one of
  them may be live at a time.
