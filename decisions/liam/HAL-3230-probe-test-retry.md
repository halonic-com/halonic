# Decision: on Windows the real process-table tests warm PowerShell up and get one retry

- Requirements: `system-node.resource-probe`, `contracts.resource-probe`
- Task: HAL-3230, follows HAL-3084 (`HAL-3084-probe-test-timeout.md`)
- Approval: the maintainer asked for this change on [HAL-3230](/HAL/issues/HAL-3230); Julian reviews it as the owner of the contract suite
- Kind: internal

## What changes

The same two tests as in HAL-3084 (`lists a process this one started, by its real pid` and
`lists the processes below the engine once each, in pid order`) get `retry: 1` on Windows only. The contract takes it as an option (`processTableRetries`), which `adapters/system-node` sets on Windows; other adapters run it once.
In `adapters/system-node`, a `beforeAll` starts the process-table reader once on Windows, before the
tests, and asserts nothing. Nothing the tests check changes, and the adapter's 15 s limit stays as it is.

## Why

After the 20 s test timeout of HAL-3084, the Windows sandbox job still failed in the merge queue
(run 42793662962): the adapter's own 15 s limit killed PowerShell on a loaded runner and both tests
failed at 16 s. The cost is the cold PowerShell and WMI start, which the warm-up pays outside any
assertion. One retry covers the remaining case of a single slow start.

A reader that really hangs still fails: it hits the 15 s limit on the retry too, and the test fails
with the adapter's error. Raising the limit would make that slower for users, so it stays at 15 s.
Linux and macOS run each test once, as before.

## Covers

- system-node.resource-probe
- contracts.resource-probe
- packages/adapters/system-node/src/resource-probe.test.ts
- packages/testing/contracts/src/resource-probe.ts
