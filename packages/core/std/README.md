# @halonicjs/std

In-house utilities that replace generic libraries: result type, ids, clock, SHA-256, scrypt, text helpers, deep equality, glob matching, posix paths and a typed event emitter (plan 7.3).

- **Layer:** core
- **Owner:** maya
- **Public API:** `@halonicjs/std`

The core has no access to the platform, so anything that needs the outside
world comes in as a parameter: the time through a `Clock`, randomness through
a `RandomBytes` function. Tests pass `fixedClock()` and `fixedIds()` and get
the same output on every run.

Hashing is written here too, because the core can't reach `crypto.subtle`:
`sha256` and `sha256Hex` follow FIPS 180-4 and `hmacSha256` follows RFC 2104.
They are synchronous and are tested against the NIST and RFC 4231 vectors and
against `node:crypto`. `encodeUtf8` and `decodeUtf8` replace `TextEncoder` and
`TextDecoder`, which the core can't see either.

`scrypt` (RFC 7914) is the password hash for every target, Workers too
(multi-cloud ADR section 8). It is built on the in-house SHA-256 through
HMAC and PBKDF2, refuses settings that need more than 32 MiB unless you raise
`maxMemoryBytes`, and is tested against the RFC vectors and `node:crypto`.
Compare hashes with `constantTimeEqual`, never with `===`.

For plain data there are `deepEqual` (key order doesn't matter) and
`deepClone` (the core has no `structuredClone`). `slugify` and `uniqueName`
turn display names into file-safe ids, as the old Studio did.

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
