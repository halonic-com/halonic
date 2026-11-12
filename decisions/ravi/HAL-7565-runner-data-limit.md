# Decision: the runner's memory limit covers the JS heap and, on Linux, buffers

- Approval: the requirement edit and the new skip need Liam's review (docs/guides/checks.md, requirement guard); Liam approves this note in review of the data-limit PR on HAL-7565 (review task HAL-7790)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:RFs8nHvUTIxzZOj8F2T6ZXWi3S2ifaMZ1p2pztu6v5QcJQnjsaHgPBTcACLQOxTllMmMaxQ0TVrRwsaAZRZhBA==
- Task: HAL-7565

## What changes

- `integration-runner.heap-limit` is reworded. `--max-old-space-size` limits only the V8
  heap. On Linux the runner also starts through `prlimit --data`, so memory behind
  `ArrayBuffer`s, typed arrays and `Buffer`s fails with a catchable `RangeError` past an
  allowance. macOS and Windows get no such limit, and the requirement and the README say so.
- `packages/adapters/integration-runner/src/runner-file.test.ts` skips the typed-array
  case everywhere but Linux (`it.skipIf(!isLinux)`), because `prlimit` and its data limit
  exist only there.
- A Linux machine without `/usr/bin/prlimit` (NixOS, a minimal Alpine) gets the heap limit
  only. The requirement names it as a gap with a new example: the runner starts anyway and
  Halonic says so once. `startRunner` looks for `prlimit` on the host before it opens the
  session, and `runnerCommand` leaves it out when it isn't there. The sentence goes to the
  new `onNotice` option, once per process, and only when a start passes `onNotice` (HAL-7794).

## Why

An integration could allocate typed arrays without end and take a machine's memory, although
the requirement said "allocates without end" ends the runner. Nothing on macOS or Windows
can bound that without native code or a new port method (see the finding on HAL-7565 and
the A24 line of the design, HAL-958), so the requirement is narrowed there instead of
claiming more than it delivers. The hard-coded `/usr/bin/prlimit` made the runner impossible
to start where it is missing, which is worse than starting without the buffer limit (review
of halonic#2260).

## Known gaps

- macOS, Windows and Linux without `prlimit`: no limit on memory outside the JS heap (A24
  stays open there).
- Callers must pass `onNotice` to show the missing-`prlimit` sentence; without it nothing is
  said. No product code calls `startRunner` yet.

## Covers

- integration-runner.heap-limit
- packages/adapters/integration-runner/src/runner-file.test.ts
- packages/adapters/integration-runner/src/halonic/start-runner.test.ts
- packages/adapters/integration-runner/src/halonic/runner-profile.test.ts
