# Decision: a change to docs/guides/server-engine-public.md tests the CLI

- Task: HAL-18504
- Approval: part 2 of the server engine runbook (HAL-18504, plan HAL-17512 section 7). `tooling/check/src/lib/affected-tests.ts` is a guard trust root, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3cDvVfEWDgZY1R49am+VDOlJPq+xR6En6WhKmB/0UoqJFQWKXrNZi5a44NUh894flt6RpQQi9McEJ95A+xOOAA==

## What changes

- `tooling/check/src/lib/affected-tests.ts`: `docsReaders` now lists
  `docs/guides/server-engine-public.md` with the package `halonic` (the CLI). A changed
  public runbook selects the CLI's tests instead of no package's tests.

## Why

This pull request adds `apps/cli/src/commands/serve/public-runbook.test.ts`, which reads
`docs/guides/server-engine-public.md`. The `docs-readers` check requires every doc a test
reads to be listed with that test's package. Without the entry, a change to the runbook
would skip the CLI test that holds it to its requirement.

## Tests

No test was weakened or skipped. The entry is the same as the one for
`docs/guides/server-engine.md` (HAL-19227).

## Covers

- tooling/check/
