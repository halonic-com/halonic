# @halonicjs/std

In-house utilities that replace generic libraries: result type, ids, clock, SHA-256, scrypt, text helpers, deep equality, glob matching, posix paths and a typed event emitter (plan 7.3).

- **Layer:** core
- **Owner:** maya
- **Public API:** `@halonicjs/std`

The core has no access to the platform, so anything that needs the outside
world comes in as a parameter: the time through a `Clock`, randomness through
a `RandomBytes` function. Tests pass `fixedClock()` and `fixedIds()` and get
the same output on every run.

Each behaviour has a requirement in [`requirements/`](requirements/).

## Example

```ts
import { assert, fixedClock, fixedIds, ok, randomIds, systemClock } from "@halonicjs/std";

// In an app: real time and real randomness, passed in by the caller.
const ids = randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), systemClock);
ids.next("run"); // "run_mfx3k2a1_a1b2c3d4"

// In a test: the same ids and times on every run.
const testIds = fixedIds();
testIds.next("run"); // "run_1"
fixedClock().now().toISOString(); // "2026-01-01T00:00:00.000Z"

assert(ok(1).ok, "ok() always succeeds");
```
