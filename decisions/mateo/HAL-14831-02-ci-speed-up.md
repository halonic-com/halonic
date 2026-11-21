# Decision: on our own CI server, the build caps its test workers; eight build shards, Fast gates on a large slot, and pushes no longer wait for each other

- Task: HAL-14831 (the board's decision of 21 Nov 18:20 and the out-of-memory note of 18:50)
- Approval: the board decided the shard split, the move of `fast` and the push concurrency (Timothy, 21 Nov, HAL-14831), and asked for the memory fix in the same pull request; Liam signs this note in review
- Kind: internal

## What changes

- **Memory on our own server:** the build job's "Run every task through the cache" step sets
  `TURBO_CONCURRENCY=6` and `HALONIC_TEST_WORKERS=3` when `runner.environment` is `self-hosted`.
  A large slot has 12 CPUs in 16 GB, and Vitest starts one worker per CPU, so Turbo's 10 packages
  at once with about 11 workers each ran `studio-features` out of memory (run 44936439288). Six
  packages with three workers each is less parallel work than a GitHub runner already does in the
  same 16 GB (10 packages, 3 workers each on 4 CPUs). On `ubuntu-24.04` nothing changes:
  `TURBO_CONCURRENCY` stays 10 and `HALONIC_TEST_WORKERS` stays unset.
- **Eight build shards instead of four** (`BUILD_SHARDS` and the build job's matrix), balanced by
  the uncached task times of the last ten merge groups: about 1,400 to 1,750 task-seconds each,
  against about 3,100 for the largest of the four. Two Studio-feature shards and one adapter shard
  name their packages one by one; the shard with the folder glob takes everything else, so a new
  package always lands in exactly one shard. The first shard's dry run still checks that every
  package is in exactly one shard. `adapter-password-scrypt` stays with the apps and tooling, away
  from the heavy tests (HAL-9808). The guard and trace jobs read the shard names from
  `BUILD_SHARDS`, so they need no change.
- **Fast gates on a large slot:** `fast` uses `CI_RUNNER_LARGE` instead of `CI_RUNNER_SMALL`. On a
  2-CPU slot it took 50 s, no faster than on GitHub.
- **Pushes keyed on their commit:** the run's concurrency group for a push is now `ci-<sha>`, not
  `ci-refs/heads/main`. A push to `main` no longer waits for the previous push's Windows jobs, and
  a newer push no longer replaces a waiting one, so every `main` commit is tested. Pull requests
  (keyed on their number, cancelled by a newer push) and merge groups (keyed on their commit)
  behave as before. `release/**` pushes are keyed on their commit too.
- `tooling/check`'s `ci-self-hosted-routing` test now lists `fast` with the large jobs.

## Why

The board measured the self-hosted runs on `main` and wants them faster now that the server works:
a shard there takes 2-4 minutes, almost all of it tests, so more shards shorten the merge queue's
critical path. The memory cap is what lets the board switch pushes back on.

## Tests

No test was weakened or skipped. The routing test moves `fast` from the small to the large list;
it still checks every moved job's expression character for character.

## Covers

- .github/
- tooling/check/
