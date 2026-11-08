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

```ts
import { NodeCoordination, randomLeaseToken } from "@halonicjs/adapter-coordination-node";

const coordination = new NodeCoordination({
  store: recordStore,
  clock: { now: () => new Date() },
  newToken: randomLeaseToken,
});
const lease = await coordination.tryAcquire("routine:daily", 30_000);
if (lease !== null) {
  // … fire the routine, renewing the lease if it takes longer …
  await coordination.release(lease);
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
- **Growth:** an expired lease or a closed window is only replaced when its
  key is used again, so it stays in memory and in the store's log. Every
  change is a new log entry. Compacting the log is a follow-up for the
  file-backed record store.
