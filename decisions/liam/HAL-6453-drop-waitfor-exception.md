# Decision: the requirement guard no longer skips expect-count drops in tests that use vi.waitFor

- Task: HAL-6453 (last step of HAL-6369)
- Approval: `tooling/check/src/guard/` is a trust root, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:YdyztIkmalFd8k/bD/U5z9gnKjxBTK7RykFG8OKLhC6M3wPOrEAZPvhOTNO7AfkdBjepncevKm2N/TwiQgLZBw==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:zMYhx8hxq6C3ZS85d9D+Uwg7sob7bYPg9Lsip3BpbTBM4T/IVWX4Qv6K8WSHgFozlSWwMogs9VLuGOKdWAUqDQ==

## What changes

`checkTestRuns` in `tooling/check/src/guard/test-runs.ts` loses `timingOnlyDrops`, the exception halonic#1982 added for HAL-6369. A lower expect count for a requirement in a package the pull request changed is a finding again, whether or not its tests call `vi.waitFor`. The four tests of that exception in `guard-test-runs.test.ts` become one test: a lower count in a test file that calls `vi.waitFor` fails.

## Why

The exception was a stopgap. `vi.waitFor` ran its callback again until it passed, so the expect count `verifies()` recorded depended on the runner's speed. Since halonic#3318 (HAL-6453 step 1, on `main` since 17 Nov), `verifies()` keeps only the calls of the attempt that passed, so the count no longer depends on timing. The exception also had gaps: it only looked at a requirement's own test files, so a retry in a shared helper wasn't covered (HAL-8866), and it let a real drop through when a test file happened to call `vi.waitFor`. Removing it makes the guard stricter, not looser.

## Tests

No test was skipped. `guard-test-runs.test.ts` passes (16 tests, 20 before). The four removed tests checked the exception itself; the new one checks that a test with `vi.waitFor` is held to the same rule as any other. They all verify `check.guard-fewer-assertions`, so that requirement now has 6 tests and 8 expect calls instead of 10 and 12. The drop is intended, so both are listed under Covers.

## Covers

- tooling/check/
- tooling/check/src/test/guard-test-runs.test.ts
- check.guard-fewer-assertions
