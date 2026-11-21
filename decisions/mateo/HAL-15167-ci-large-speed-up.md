# Decision: on our own CI server, the build caps Turbo tasks and test workers; eight build shards and Fast gates on a large slot

- Task: HAL-15167 (split out of HAL-14831: the board's decision of 21 Nov 18:20 and the out-of-memory note of 18:50)
- Approval: the board decided the shard split and the move of `fast` (Timothy, 21 Nov, HAL-14831) and asked for the memory fix (HAL-15167); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jtcUPU4Hg+hNv1lTUgldfu98qxkvAPs7BfAFLR+tBFwFTonOWTHFG1DmnVuX7UXAsscNuECWj7Krp7fO4bsBBQ==

## What changes

- **Memory on our own server:** the build job's "Run every task through the cache" step sets
  `TURBO_CONCURRENCY=6` and `HALONIC_TEST_WORKERS=3` when `runner.environment` is `self-hosted`.
  A large slot has 12 CPUs in 16 GB, and Vitest starts one worker per CPU, so Turbo's 10 tasks at
  once with about 11 workers each ran `studio-features` out of memory (a `tsc` and a test worker
  were killed). Six tasks with three workers each, at most 18 workers, is less parallel work than a
  GitHub runner already does in the same 16 GB (10 packages, 3 workers each on 4 CPUs). The repo
  variables `CI_SELF_HOSTED_TURBO_CONCURRENCY` and `CI_SELF_HOSTED_TEST_WORKERS` change the two
  numbers without a pull request. On `ubuntu-24.04` nothing changes: `TURBO_CONCURRENCY` stays 10
  and `HALONIC_TEST_WORKERS` stays unset, so Vitest keeps its defaults. Neither variable is in
  Turbo's cache key, so both runner kinds share the cache.
- **Eight build shards instead of four** (`BUILD_SHARDS` and the build job's matrix), balanced by
  the merge-queue task timings of 21 Nov: about 1,150 to 1,900 task-seconds each, against about
  3,700 for the largest of the four. The `-a` shards name their packages one by one; the `-b`
  shards take the rest of their folder with matching `!` exclusions, so a new adapter or feature
  always lands in exactly one shard. The first shard's dry run still checks that every package is
  in exactly one shard. `adapter-password-scrypt` stays with the lighter tooling and targets tests,
  away from the heavy ones (HAL-9808). The guard and trace jobs read the shard names from
  `BUILD_SHARDS`, so they need no change.
- **Fast gates on a large slot:** `fast` uses `CI_RUNNER_LARGE` instead of `CI_RUNNER_SMALL`. On a
  2-CPU slot it took 50 s, as long as on GitHub.
- `tooling/check`'s `ci-self-hosted-routing` test now lists `fast` with the large jobs.

Not in this change: pushes to `main` keyed on their own commit. That moves to HAL-15187, because
it would run the Windows and macOS jobs on every merge.

## Why

The board paused self-hosted push runs after the out-of-memory failure and turns them back on once
this fix is in. A shard there takes 2-4 minutes, almost all of it tests, so more shards shorten the
merge queue's critical path.

## Tests

No test was weakened or skipped. The routing test moves `fast` from the small to the large list;
it still checks every moved job's expression character for character.

## Covers

- .github/
- tooling/check/
