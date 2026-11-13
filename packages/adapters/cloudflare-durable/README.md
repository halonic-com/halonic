# @halonicjs/adapter-cloudflare-durable

The `Coordination` port on Cloudflare: leases, compare-and-set values, counters
and the login-limit window, all kept in a Durable Object (HAL-197 part 5). The
object runs one request at a time and every call changes its storage in one
transaction, so parallel attempts never get past a limit. The object reads its
own clock, so Workers instances with different clocks agree on when a lease or
window ends.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** workers
- **Public API:** `@halonicjs/adapter-cloudflare-durable`

## Durable Object class names are fixed

Cloudflare keys an object's data by its class name. **Renaming or deleting a
class deletes the data of every object of that class.** These names are fixed
from the first deploy and must not change:

| Class | What it holds |
| --- | --- |
| `CoordinationObject` | leases, values, counters and windows of one deployment |
| `RunObject` | one run's event log and timers (HAL-6796) |

`durableObjectClassNames` lists them, and `src/test/class-names.spec.ts` (run
inside workerd by `class-names.test.ts`) fails when the list changes or a
class is no longer exported under its name. A new class gets a name here, a
line in this table and a migration entry in the Worker's configuration. The
Worker (HAL-197 part 9) re-exports each class under its name.

## How it works

- `CoordinationState` is the logic, over a small `StateStorage`: Durable
  Object storage in the Worker, an in-memory fake in the Node tests.
- `CoordinationObject` is the Durable Object class: each method calls the same
  method of `CoordinationState`, so callers can use it over RPC.
- `DurableCoordination` is the `Coordination` the rest of Halonic uses. It
  finds the one object named `coordination` (or the name you give it) in the
  bound namespace and forwards every call.
- The input rules of the port (key and value sizes, whole positive amounts)
  are checked inside the object and rejected with a `RangeError`, which
  arrives unchanged through RPC.

One object serves a whole deployment, which is far below the limit of a single
Durable Object for the traffic coordination sees. If that changes, keys can be
sharded across several objects by name; no key's operations span two.

Leases and windows that have run out stay in storage until the same key is used
again. Clearing them on an alarm comes with the run object (part 6).

## The run object

`RunObject` (HAL-197 part 6) is one Durable Object per run, named after the
run id. It keeps the run's event log (`RunLog`) and the timers of its key
(`TimerTable`) in its own SQLite storage. `DurableScheduler` is the `Scheduler`
port over it.

- **One alarm.** The object keeps its alarm at the earliest time a timer is
  due. When it fires, `alarm()` delivers what is due to the listener and sets the
  alarm again in a `finally`, so a failure never leaves timers without one.
- **Delivery during a call.** A Durable Object never runs two alarms at once,
  but the port promises a timer that comes due while another timer's call runs
  is delivered. So `alarm()` runs a loop (`TimerDelivery`) that starts every due
  timer, waits for a call to end or the next timer to come due, and looks again.
- **Retries.** A rejected timer is due again after 1 second, doubling, at most
  15 minutes, and is never dropped. Each timer keeps its failure count and a
  version, so a timer the listener sets or cancels during its call is not
  undone when the call ends.
- **The run list.** Every successful append notes in an outbox, in the same
  transaction, that the run list (`D1RunList` in `adapter-cloudflare-storage`)
  is behind. The alarm sends the run's summary, worked out from the log, so a
  slow or failing D1 never slows an append. A failed send is kept and tried again
  on the same alarm with the timers' backoff, and then sends the latest
  summary. The D1 side only replaces a run's row with a later event, so repeats
  and late updates change nothing. `DurableRunStore` is the `RunStore` port:
  `get` comes from the log (always current), `list` from D1 (may lag).
- **The listener and the run list.** The platform wakes the object, not the client, so the
  Worker subclasses `RunObject` and overrides `timerListener()` and `runList()`.
- **The tick** is the cron's (part 7), not the object's.

## The watchdog

`Watchdog` (HAL-197 part 7) wakes runs that are stuck, so none stays stuck for
good. `sweep()` is meant for the routine tick: the Worker's tick listener calls
it after the routine scheduler. It reads the running and waiting runs from the
run list and asks each run object for its `health()`: the time of its last
event, and how long its earliest timer has been due without delivery.

- **What counts as stuck.** A timer due for at least 2 minutes (its alarm was
  lost), or a *running* run with no new event for 10 minutes. A waiting run with
  no overdue timer is never stuck, however long it waits: it rightly waits days
  for an approval.
- **How it wakes a run.** It sets the run's `watchdog` timer (`watchdogTimerId`)
  for now. Setting a timer moves the object's alarm to the earliest due time, so
  the run's overdue timers are delivered with it. The engine treats the
  `watchdog` timer as "look at this run again" and ignores it when there is
  nothing to do, so waking is safe to repeat.
- A run whose check or wake fails is in the report's `failed`; the others go on.

## Tests

The `Coordination` contract runs two ways. `coordination.test.ts` runs it
inside workerd, through Miniflare, against the real Durable Object and real
storage. `state-contract.test.ts` and `durable-coordination.test.ts` run it in
Node against an in-memory storage fake, which also gives this package its
coverage numbers (code inside workerd can't be measured from Node).

## Example

```ts
import { DurableCoordination } from "@halonicjs/adapter-cloudflare-durable";

// In the Worker, with the `COORDINATION` binding of `CoordinationObject`:
const coordination = new DurableCoordination({ namespace: env.COORDINATION });
const lease = await coordination.tryAcquire("routine:daily", 30_000);
const { allowed } = await coordination.countInWindow("login:acme-hash", 60_000, 5);
```
