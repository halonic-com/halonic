# Decision: inside `vi.waitFor`, only the passing attempt's `expect` calls count

- Task: HAL-6239
- Approval: Liam asked for this change on [HAL-6239](/HAL/issues/HAL-6239) and approves this note in review
- Kind: internal

The requirement guard grows more reliable; nothing it caught before is now missed, and no test was weakened.

## What changes

`verifies()` wraps `vi.waitFor` for the tests inside it. When an attempt of the callback throws,
the `expect` calls it made are taken off the test's count again, for the global `expect` and the
test's own `({ expect })`. After each test `vi.waitFor` is Vitest's own again. `expect.poll` needs
nothing: it calls `expect` once, however often it retries.

## Why

The guard compares each requirement's `expect` count with the merge base. A retried
`vi.waitFor(() => expect(…))` added one call per attempt, so the count depended on timing, and
the fewer-`expect` rule fired on pull requests that didn't touch the test
(`cli.commands.routines.watch` on halonic#1746: 228 against 245). Now a test counts the same on
every run.

## Tests

The new requirement `spec.verifies-counts-passing-wait-for` has three tests, all additions: a
synchronous and an asynchronous callback that retry, the test's own `expect`, and `vi.waitFor`
being restored outside `verifies()`. Without the fix the count test reads 5 instead of 2.

## Covers

- `spec.verifies-counts-passing-wait-for`
- `packages/testing/spec/`
