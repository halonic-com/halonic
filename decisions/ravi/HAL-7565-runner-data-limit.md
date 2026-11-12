# Decision: the runner's memory limit covers the JS heap and, on Linux, buffers

- Approval: the requirement edit and the new skip need Liam's review (docs/guides/checks.md, requirement guard); Liam approves this note in review of the data-limit PR on HAL-7565 (review task HAL-7790)
- Kind: internal
- Task: HAL-7565

## What changes

- `integration-runner.heap-limit` is reworded. `--max-old-space-size` limits only the V8
  heap. On Linux the runner also starts through `prlimit --data`, so memory behind
  `ArrayBuffer`s, typed arrays and `Buffer`s fails with a catchable `RangeError` past an
  allowance. macOS and Windows get no such limit, and the requirement and the README say so.
- `packages/adapters/integration-runner/src/runner-file.test.ts` skips the typed-array
  case everywhere but Linux (`it.skipIf(!isLinux)`), because `prlimit` and its data limit
  exist only there.

## Why

An integration could allocate typed arrays without end and take a machine's memory, although
the requirement said "allocates without end" ends the runner. Nothing on macOS or Windows
can bound that without native code or a new port method (see the finding on HAL-7565 and
the A24 line of the design, HAL-958), so the requirement is narrowed there instead of
claiming more than it delivers.

## Known gaps

- macOS and Windows: no limit on memory outside the JS heap (A24 stays open there).

## Covers

- integration-runner.heap-limit
- packages/adapters/integration-runner/src/runner-file.test.ts
