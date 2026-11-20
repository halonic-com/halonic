# Decision: the build runs as four parallel jobs, also in the merge queue and on main

- Approval: the board's decision on HAL-14115 (20 Nov, "Ok we do all", step 1); Liam approves this note in review on HAL-14115 and signs it, Julian reviews the guard job's part
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nfvRftVQ0U/V0getMhDPaRAmJISG0DM29Mxt6cbCYP762AK2XNXkE5X2L4YGYX3P7b3GrPfHyanoY5kQSubGAw==

## What changes

In `.github/workflows/ci.yml`, the `Typecheck, lint, test, build` matrix from HAL-9808 now
covers every event (pull requests, the merge queue and pushes), and its shards are cut by
folder instead of by task:

| Shard | Packages | Merge-queue task time (20 Nov) |
| --- | --- | --- |
| `adapters` | `packages/adapters/*` except `adapter-password-scrypt` | ~2,470 s |
| `studio-features` | `packages/studio/features/*` | ~2,230 s |
| `core-studio` | `packages/core/*`, `packages/studio/*` | ~2,100 s |
| `apps-tooling` | `apps/*`, `tooling/*`, `packages/host/*`, `packages/targets/*/*`, `packages/testing/*`, `adapter-password-scrypt` | ~2,250 s |

- The shards are one workflow variable, `BUILD_SHARDS`: a line per shard with its name and
  its Turbo filters. Each shard runs typecheck, lint, test and build for its own packages.
  The one-job `all` path is gone. On `main` each shard saves its own GitHub cache
  (`turbo-<os>-<shard>-<sha>`), and the shards write the remote cache as the one job did.
- The first shard runs `turbo run … --dry=json` for all packages and for each shard. It fails
  unless every package is in exactly one shard, every shard has a package, and
  `BUILD_SHARDS` has as many shards as the matrix. A new package lands in a shard by its
  folder; a new top-level folder fails this check until it's given a shard.
- `adapter-password-scrypt`, the slowest test (about 370 s), sits with the lighter apps and
  tooling tests: beside only heavy tests, one scrypt test ran past its 180 s limit (HAL-9808).
- With affected tests on (pull requests), each shard tests only its affected packages, as
  before.
- Every shard uploads `test-results-<shard>`. In the merge queue and on a push, a new job,
  `trace`, needs the build, downloads every shard's archive, fails if one is missing, and
  runs `pnpm check trace --report`, as the single job did. `ci-ok` waits for it.
- The guard job (pull requests) downloads the archives by the pattern `test-results-*` and
  reads one per shard name in `BUILD_SHARDS`, so a missing one fails. Each still goes through
  the same plain-files unpack check, the empty-archive check with affected tests off, and the
  skipped-or-cancelled build check. The merge base's archive is still read by ID and checked
  against its sha256.
- The shards keep the runner rule every merge-queue job has had since #4168: the repo
  variable `MERGE_QUEUE_RUNNER` names the runner for `merge_group` jobs (such as
  `large-runner` in the runner group `merge-queue-large`), and unset they use
  `ubuntu-24.04`. Pull requests and pushes never run on it. This change adds no variable.

No trigger, right or secret changes. The shards' timeout stays at 25 minutes.

## Why

A merge group's build was one job of 14 to 17 minutes (five runs on 20 Nov: 832 to 1,000 s
in Turbo alone, about 9,060 task-seconds). Split four ways it should take about 5 to 7
minutes, so the queue merges two to three times as many groups an hour. Main's own build
gets as fast, so it refreshes the remote cache more often: merge groups can only read the
cache, and this morning they reused none of their typecheck, test and build tasks. Folders
keep the balance without a list of package names to maintain, and one path for every event
keeps the job simpler than #3727's two.

## Tests

No test was weakened or skipped. The shards run the same tasks one job would, and the dry-run
check proves the split. Checked locally: the four shards hold 38, 15, 19 and 28 of the 100
packages, and the check fails when a folder is left out, a package is in two shards or the
matrix has a different number of shards.

## Covers

- .github/
