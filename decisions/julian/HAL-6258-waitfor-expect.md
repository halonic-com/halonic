# Decision: `verifies()` counts only the `vi.waitFor` attempt that passed

- Approval: Liam asked for this fix on [HAL-6258](/HAL/issues/HAL-6258) and approves this note in review
- Kind: internal
- Task: HAL-6258

## What changes

`verifies()` wraps `vi.waitFor` once per Vitest instance. Each attempt of the callback remembers the
global `expect` count, and the test's own `({ expect })` count if the test has used it. When the
attempt throws or its promise rejects, both counts go back to what they were before it. A passing
attempt keeps its calls. The new requirement `spec.verifies-counts-passing-wait-attempt` says so,
with two tests: a sync callback and an async one with the test's own `expect`, each failing twice
before it passes, record 1. `spec.verifies-counts-assertions` is unchanged and its tests still pass.

## Why

The requirement guard compares each requirement's `expect` count between the merge base and the pull
request. An `expect` inside `vi.waitFor` counted once per retry, so the count followed the machine's
speed: `apps/cli/src/commands/routines/watch.test.ts` made 25 and then 29 calls in two runs of the
same tree. Any pull request that touched `apps/cli` could fail on "fewer expect calls" (halonic#1892).

The other fix the task allowed, moving every `expect` out of `vi.waitFor`, would change 67 waits in
26 test files, and each moved `expect` lowers its requirement's count, so the guard would need a note
for most of those requirements. It would also need a lint rule to stop the pattern coming back.
Counting in `verifies()` fixes every test at once, keeps the tests as they are, and needs no new rule.

The wrapper reads Vitest's internal `_local` flag to know whether the test's own `expect` exists.
Reading `context.expect` itself would create it, and Vitest would then check the test's assertions
on that one instead of the global one. If Vitest renames the flag, the wrapper only takes back the
global count, and the new requirement's async test fails, so the change can't go unnoticed.

No test is weakened: no test, requirement or assertion is removed. The note covers the guarded path
`packages/testing/spec/`, which every change to this package needs.

## Covers

- packages/testing/spec/
