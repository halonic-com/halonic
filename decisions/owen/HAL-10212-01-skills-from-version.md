# Decision: the harness takes a run's skills from the run's version

- Task: HAL-10212 (follow-up 3 of the review of #2917 on HAL-10210)
- Approval: HAL-10212, Liam's review of the stacked pull request; Liam signs this note as the CTO
- Kind: internal

## What changes

`cli.local-harness-host` now says the run's instructions are the agent's `instructions` and selected skills "from the run's version when runs start from versions, else as on disk", where it said "as on disk". Nothing it promised before is removed or weakened: without versions the files are still read from disk, and the copy is still read-only and pinned for the run log.

A skill is now found the way the run's hub sees it: the hub's own skill first, then the shared one.

## Why

Liam's review note on #2917: `AGENTS.md` and the skills in one pin must come from the same version. Reading skills from disk while `AGENTS.md` came from the run's version could pin two different states.

## Tests

No test was weakened or removed. A new test checks hub-before-shared skill lookup, and the "writing nothing" test in `run-instructions.test.ts` now checks that nothing was written.

## Covers

- cli.local-harness-host
