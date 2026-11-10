# @halonicjs/adapter-coordination-node

The `Coordination` port on Node: leases with tokens and expiry,
`compareAndSet` values, counters with a limit and fixed-window attempt
counts, kept so they survive a restart. For `halonic serve` and the desktop
app, where one Node process runs the engine.

- **Layer:** adapters
- **Owner:** priya
- **Public API:** `@halonicjs/adapter-coordination-node`

## Where the state is kept

In a `RecordStore` collection (`halonic.coordination` unless you pass
another), one record per kind and key. The package holds no file code: the
store decides where the records go. Calls run one at a time, and each writes
its change to the store before it answers. Every operation is atomic, and
parallel calls never get past a limit. After a restart a lease stays held
until it runs out, and counters and windows go on where they were. When a
write fails, the call rejects and nothing changes.

The clock is passed in, so tests run on fake time.

## Example

Leases, values, counters and windows, and a restart. The code lives in
[`examples/leases-values-and-limits.ts`](examples/leases-values-and-limits.ts), where it is
typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/adapter-coordination-node` as below. The example keeps its state in the memory adapter's
store and moves its clock by hand; on a server, pass the real store and
`clock: { now: () => new Date() }`.

```ts
import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { NodeCoordination, randomLeaseToken } from "@halonicjs/adapter-coordination-node";

/** Takes a lease, sets a value, counts against a limit, then restarts on the same store. */
export async function runExample(): Promise<{
  firstLease: boolean;
  secondLease: boolean;
  valueSet: boolean;
  valueSetAgain: boolean;
  counts: number[];
  counterRefused: boolean;
  windowAllowed: boolean[];
  leaseHeldAfterRestart: boolean;
  counterAfterRestart: number;
}> {
  // The store keeps the state; the clock is passed in, so the example moves time by hand.
  const store = new MemoryRecordStore();
  const clock = new ManualClock("2026-11-09T07:00:00.000Z");
  const options = { store, clock, newToken: randomLeaseToken };
  const coordination = new NodeCoordination(options);

  // A lease is held until it is released or its time runs out.
  const lease = await coordination.tryAcquire("routine:daily", 30_000);
  const secondLease = await coordination.tryAcquire("routine:daily", 30_000); // null: still held
  const firstLease = lease !== null;

  // A value changes only when it is what the caller expects: null means "not set yet".
  const valueSet = await coordination.compareAndSet("run:1:state", null, "waiting"); // true
  const valueSetAgain = await coordination.compareAndSet("run:1:state", null, "done"); // false

  // A counter adds `by` unless that would go above the limit.
  const counts: number[] = [];
  for (let i = 0; i < 3; i++) {
    counts.push((await coordination.increment("budget", 2, 5)).value); // 2, 4, then 4 again
  }
  const counterRefused = !(await coordination.increment("budget", 2, 5)).applied; // true

  // A window allows `limit` attempts, then refuses until the window ends.
  const windowAllowed: boolean[] = [];
  for (let i = 0; i < 3; i++) {
    windowAllowed.push((await coordination.countInWindow("login:ada", 60_000, 2)).allowed); // true, true, false
  }

  // After a restart, a new instance on the same store still sees the lease and the counter.
  const restarted = new NodeCoordination(options);
  const leaseHeldAfterRestart = (await restarted.tryAcquire("routine:daily", 30_000)) === null; // true
  const counterAfterRestart = (await restarted.increment("budget", 1, 5)).value; // 5

  if (lease !== null) {
    await restarted.release(lease);
  }
  return {
    firstLease,
    secondLease: secondLease !== null,
    valueSet,
    valueSetAgain,
    counts,
    counterRefused,
    windowAllowed,
    leaseHeldAfterRestart,
    counterAfterRestart,
  };
}
```

## Behaviour

- **Leases** end at their expiry time by the adapter's clock. Renewing keeps
  the token; an old token can neither renew nor release. Tokens come from
  `newToken`; `randomLeaseToken` uses Node's cryptographic random source, so
  a token can't be guessed and never repeats after a restart.
- **Input rules** are the port's: keys of 1 to 256 UTF-8 bytes, values up to
  64 KiB, positive safe whole amounts. Breaking one throws a `RangeError`
  before anything is read or written.
- **Counters** never go past `Number.MAX_SAFE_INTEGER`. Without a `limit`,
  that is the ceiling: going over it answers `applied: false`, as going over
  a `limit` does.
- **One process:** memory is the adapter's working copy, so two processes
  must not share one collection.
- **Start-up clean-up:** when it starts, the adapter removes the leases that
  have run out and compacts the collection, so released leases, deleted
  values and replaced entries leave the store. If the store fails the
  clean-up, the adapter still starts from the state it read and the next
  start tries again.
- **Growth:** between starts, an expired lease or a closed window is only
  replaced when its key is used again, so it stays in memory and in the
  store's log until the next start. Every change is a new log entry.
- **Foreign records:** when the collection holds a record this adapter
  didn't write, every call rejects with an error that names the record, and
  the collection is left as it is.
