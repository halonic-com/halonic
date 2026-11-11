# Decision: the routines watch test waits on a plain condition, then asserts once

- Task: HAL-6239
- Approval: Liam chose this stopgap on [HAL-6239](/HAL/issues/HAL-6239) and approves this note in review
- Kind: internal

No test was weakened: every check the test made before, it still makes once, after the wait.

## What changes

`apps/cli/src/commands/routines/watch.test.ts` waited with `vi.waitFor(() => expect(…))`, which
retries the `expect` until it passes. Each wait is now `vi.waitUntil` on a plain condition (a
line was printed, the run is completed), followed by the same `expect` once.

## Why

Every retried attempt added its `expect` calls to the count of `cli.commands.routines.watch`, so
the count depended on timing (226 to 250 on CI) and the fewer-`expect` rule of the requirement
guard fired on pull requests that didn't touch the test, five times since 9 Nov. The count is now
17 on every run.

The fix for all tests, in `verifies()` itself, is halonic#1951. It changes the guard, so it waits
for the user's signature (HAL-3434).

## Tests

The four tests pass, and three runs in a row count 17 `expect` calls each.

## Covers

- cli.commands.routines.watch
