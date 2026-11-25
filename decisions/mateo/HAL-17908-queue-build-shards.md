# Decision: merge groups and pushes build in four shards, pull requests keep nine

- Task: HAL-17908 (item 6 of the merge-time report on HAL-17891)
- Approval: HAL-17908 was opened from the merge-time report on HAL-17891 (item 6, 24 Nov) and specifies this change; Liam signs this note in review
- Kind: internal

## What changes

- `.github/workflows/ci.yml`: a new workflow-level list, `QUEUE_BUILD_SHARDS`, holds the same
  packages as `BUILD_SHARDS` in four lines, each joining whole pull-request shards:
  `adapters-core` (`adapters-a`, `adapters-b`, `core`), `studio` (`features-a`, `features-b`,
  `studio-testing`), `apps-host-tooling` (`apps-host`, `tooling-targets`) and `app-studio`.
  - The build job's matrix takes the nine names on a pull request and the four otherwise. Outside
    a pull request a first step points `BUILD_SHARDS` at the queue list for the rest of the job,
    so the run step and the coverage check read the event's list. `app-studio` keeps its own
    shard and its 6 test workers in both lists.
  - On a pull request the first shard's coverage check also checks the queue list, so a package a
    new folder leaves out fails on the pull request, not in the merge queue.
  - `trace` (merge queue and pushes only) unpacks the archives by the queue's names.
  - `base-tests`' reuse of main's results looks for the queue's names, since main's runs build
    those. A main run from before this change has none of them and is passed over: the merge
    base is tested instead, as when no run is found, until those runs' 1-day artifacts expire.
  - The guard job (pull requests only) still reads `BUILD_SHARDS`.
- New requirement `check.ci-queue-build-shards` and its wiring test.
  `ci-base-tests-reuse.test.ts` passes its two fixture shards as `QUEUE_BUILD_SHARDS`, the list
  the reuse step now reads; no test is weakened.
- `docs/guides/checks.md`: the build row names the queue's four shards.

## Why

In the merge queue most build tasks are cache hits, so seven of the nine shards ran about a
minute and then waited up to 4-5 minutes (p90) for a large slot; one group took about 13 of the
pool's 19 slots (HAL-17891). Over 38 green merge groups (24-25 Nov) the slowest of the nine
shards took 184 s at the median; running each new shard's old shards one after another would
take 195 s, an upper bound, since Turbo runs 4 tasks at once in a job. Pull requests run on
GitHub's runners, which don't wait, so fewer shards there would only make each job slower.

## Security

No trust change: the same packages run the same tasks with the same cache rules and tokens; only
the number of jobs changes. A pull request runs its own copy of `ci.yml` anyway, and the merge
queue checks the queue list's coverage again in its own run.

## Covers

- .github/
- tooling/check/
