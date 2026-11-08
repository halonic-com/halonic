# @halonicjs/std

In-house utilities that replace generic libraries: result type, ids, clock, UTF-8, text helpers, deep equality and clone, posix paths, constant-time comparison and a typed event emitter.

- **Layer:** core
- **Owner:** maya
- **Public API:** `@halonicjs/std`

The core has no access to the platform, so anything that needs the outside
world comes in as a parameter: the time through a `Clock`, randomness through
a `RandomBytes` function. Tests pass `fixedClock()` and `fixedIds()` and get
the same output on every run.

Hashing is not here. SHA-256 comes from WebCrypto through a port, and the
password hash from `@noble/hashes` in the package that implements
`PasswordHasher`. What stays is the part the core can't reach otherwise:
`encodeUtf8` and `decodeUtf8` replace `TextEncoder` and `TextDecoder`, and
`constantTimeEqual` compares hashes and tokens without leaking where they
differ. Never compare those with `===`.

For plain data there are `deepEqual` (key order doesn't matter),
`deepClone` (the core has no `structuredClone`) and `isPlainObject`, which
tells a plain record apart from a `Date`, a `Map` or a class instance. `describeObject` and `keyPath` word the errors
about data that isn't plain, so they say what and where. `slugify` and `uniqueName`
turn display names into file-safe ids, as the old Studio did. `posixPath`
joins and cleans forward-slash paths like `node:path.posix`, and `Emitter` is a
small typed event emitter.

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
