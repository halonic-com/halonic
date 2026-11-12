# @halonicjs/adapter-cloudflare-durable

The `Coordination` port on Cloudflare: leases, compare-and-set values, counters
and the login-limit window, kept in a Durable Object (HAL-197 part 5). The
object runs one request at a time, and every call changes its storage in one
transaction, so parallel attempts never get past a limit.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** workers
- **Public API:** `@halonicjs/adapter-cloudflare-durable`

## How it works

`CoordinationState` is the logic, over a small `StateStorage` (a transaction
with `get`, `put` and `delete`): Durable Object storage in the Worker, an
in-memory fake in the Node tests. It reads the time from the `Clock` it is
given, so leases and windows run out by the object's own clock, not by the
clock of whichever Workers instance called. The port's input rules (key and
value sizes, whole positive amounts) are checked first and rejected with a
`RangeError`.

Leases and windows that have run out stay in storage until the same key is used
again. Clearing them on an alarm comes with the run object (part 6).

The Durable Object class, the client the Worker uses and the run in `workerd`
come in the next pull request, with the fixed class names.

## Tests

`state-contract.test.ts` runs the `Coordination` contract, parallel attempts
included, against the logic over an in-memory storage fake that, like a Durable
Object, lets one transaction run at a time.

## Example

```ts
import { CoordinationState } from "@halonicjs/adapter-cloudflare-durable";

const coordination = new CoordinationState(durableObjectStorage, clock);
const lease = await coordination.tryAcquire("routine:daily", 30_000);
const { allowed } = await coordination.countInWindow("login:acme-hash", 60_000, 5);
```
