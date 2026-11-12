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
