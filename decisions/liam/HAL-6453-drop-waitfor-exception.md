# Decision: the requirement guard no longer skips expect-count drops in tests that use vi.waitFor

- Task: HAL-6453 (last step of HAL-6369)
- Approval: `tooling/check/src/guard/` is a trust root, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:lpSMi2C4FOm1NVHXhUm/slHa8tlpRwJOipfEJjsKZlAPHiG0SFYfeU14A43VN7Gl+iDOCwIQ8TeIiufV+9wdAA==

## What changes

`checkTestRuns` in `tooling/check/src/guard/test-runs.ts` loses `timingOnlyDrops`, the exception halonic#1982 added for HAL-6369. A lower expect count for a requirement in a package the pull request changed is a finding again, whether or not its tests call `vi.waitFor`. The four tests of that exception in `guard-test-runs.test.ts` become one test: a lower count in a test file that calls `vi.waitFor` fails.

## Why

The exception was a stopgap. `vi.waitFor` ran its callback again until it passed, so the expect count `verifies()` recorded depended on the runner's speed. Since halonic#3318 (HAL-6453 step 1, on `main` since 17 Nov), `verifies()` keeps only the calls of the attempt that passed, so the count no longer depends on timing. The exception also had gaps: it only looked at a requirement's own test files, so a retry in a shared helper wasn't covered (HAL-8866), and it let a real drop through when a test file happened to call `vi.waitFor`. Removing it makes the guard stricter, not looser.

## Tests

No test was skipped. `guard-test-runs.test.ts` passes (16 tests). The removed tests checked the exception itself; the new one checks that a test with `vi.waitFor` is held to the same rule as any other.

## Covers

- tooling/check/
