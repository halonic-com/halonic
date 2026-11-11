# Decision: tests wait with `waitUntil` so their expect counts stay steady

- Task: HAL-5844
- Approval: the task asks for this change; Liam approves this note in review on [HAL-5848](/HAL/issues/HAL-5848)
- Kind: internal

## What changes

`apps/cli/src/test/wait-until.test-helper.ts` adds `waitUntil()`, which retries a check every 50 ms and then lets the test make one `expect` after the wait. The old `vi.waitFor(() => expect(...))` made one more `expect` call for every try, so a test's `expect` count changed with how long the wait took. The guard compares that count with the base commit's.

The `cli.commands.routines.watch` and `sandbox-srt.check` tests now wait with `waitUntil`, so their counts are lower than on the base commit. No check was weakened: every value those tests checked before is still checked once, after the wait, and the sandbox-srt test still checks every program it starts.

## Why

A count that moves with timing makes `check.guard-fewer-assertions` fail on a slow run for no real reason. A steady count lets the guard keep catching real drops.

## Covers

- cli.commands.routines.watch
- sandbox-srt.check
