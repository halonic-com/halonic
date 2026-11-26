# Decision: a change to docs/guides/server-engine.md tests the CLI

- Task: HAL-19227
- Approval: fixes `main` after #6159 (HAL-18502). `tooling/check/src/lib/affected-tests.ts` is a guard trust root, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible

## What changes

- `tooling/check/src/lib/affected-tests.ts`: `docsReaders` now lists
  `docs/guides/server-engine.md` with the package `halonic` (the CLI). A changed
  `server-engine.md` selects the CLI's tests instead of no package's tests.

## Why

#6159 added `apps/cli/src/commands/serve/loopback-runbook.test.ts`, which reads
`docs/guides/server-engine.md`. The test "docsReaders lists every doc a test reads, with
that test's package" in `tooling/check/src/lib/affected-tests.test.ts` checks the real repo,
so it has failed since #6159 merged. `main`'s push runs don't run it, so `main` looked
green, but every pull request that touches `tooling/check/` got a red `ci-ok` (#6216).
Without the entry, a change to that runbook would also skip the CLI test that reads it.

## Tests

No test was weakened or skipped. The existing test against the real repo passes again; it
is the test that found the gap.

## Covers

- tooling/check/
- check.affected-tests
