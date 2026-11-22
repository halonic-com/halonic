# Decision: `app-studio` gets a build shard of its own, and `Changed areas` runs on GitHub's runners

- Task: HAL-16095
- Approval: the board asked for faster merge groups (Timothy, 22 Nov, HAL-16095); Liam signs this note in review
- Kind: internal

## What changes

- **A ninth build shard, `app-studio`** (`BUILD_SHARDS` and the build job's matrix). It holds only
  `@halonicjs/app-studio`; `apps-host` keeps the other apps and `packages/host/*`. On our own CI
  server that shard runs 6 test workers instead of 2 (`test-workers` in the matrix, which wins over
  `CI_SELF_HOSTED_TEST_WORKERS`). On GitHub's runners nothing changes.
- **`changes` ("Changed areas") runs on `ubuntu-24.04`**, no longer on the server's small slots.
  The `ci-self-hosted-routing` test moves it from the small list to the jobs kept on GitHub, and
  the requirement's example for the small expression names `trace` instead, with a new example
  saying `changes` runs on `ubuntu-24.04`.

## Why

Measured over 31 green merge groups on 22 Nov (09:30–10:16 UTC):

- No heavy job waits for Fast gates: the build shards and Studio end-to-end don't `need` it, and
  every job is created with the run. The shards' late start (median 82–140 s) is the wait for one
  of the 11 large slots, which every running merge group shares.
- `apps-host` ran a median 93 s against about 26 s for every other shard. Almost all of it is one
  task, `@halonicjs/app-studio#test` (68–69 s), which misses the cache in nearly every group because
  the app depends on almost every package. Its 189 test files hold about 21 s of tests; the rest is
  each file's start-up on 2 workers. A shard of its own with the slot's 6 CPUs as workers should
  bring it near the others. Splitting `apps-host` by package alone wouldn't: that one task stays
  69 s wherever it runs.
- Studio end-to-end, scaffold and docs `need` `changes`, a 15 s job that waited a median 68 s
  (up to 173 s) for one of the 3 small slots. Studio end-to-end then finished last in most groups
  that ran it (median 269 s after the run started). On GitHub's runners the job starts within
  seconds (median 2 s over the same runs). It uses no cache and runs no tests.

Fast gates stays on a large slot: that was the board's decision (HAL-14831, HAL-15167), so moving
it is a question for the task, not part of this change.

## Tests

No test was weakened or skipped. The routing test still checks every server job's expression
character for character, and now also checks that `changes` is on `ubuntu-24.04`. The first
shard's dry run still checks that every package is in exactly one shard (run locally: 104
packages, 9 shards, each once).

## Covers

- check.ci-self-hosted-routing
- .github/
- tooling/check/
