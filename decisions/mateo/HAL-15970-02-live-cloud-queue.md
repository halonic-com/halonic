# Decision: the live cloud suites run in the merge queue, and only a direct change runs them on the pull request

- Task: HAL-15970
- Approval: Liam approves this note in review on HAL-15970; Julian reviews the `live-cloud.yml` part (the token now reaches merge groups)
- Kind: internal

## What changes

- **`live-cloud.yml` runs on `merge_group`.** Its plan job diffs the group against the commit it is
  built on (`main` or the entry ahead), which is exactly what the entry adds, and runs the suites
  when that touches a cloud path. A group reuses an earlier pass with the same inputs hash, as
  pull requests already did, and records its own pass.
- **CI's "Live cloud suites passed" job** waits in a merge group for the `live-cloud` job on the
  group's own commit (up to 45 minutes, as before), instead of on the pull request's head.
- **On a pull request** it passes with a notice, unless the change touches what the suites exercise
  directly: `cloud-affected`'s new `on-pull-request` answer (`pullRequestLivePatterns` in
  `tooling/check/src/lib/cloud-paths.ts`). Those pull requests run the suites once ready for review
  and stay red until they pass, as today (HAL-14858), and their group reuses that pass. A fork's
  pull request that touches any cloud path still fails at once, as today. A draft gets a notice.
- **The pull request's diff** in the gate and in `live-cloud.yml`'s plan is taken from the merge
  checkout's first parent, not `pull_request.base.sha` (the same fix as part 1, #4984).
- **"Cancel the run on the first failure"** also cancels the group's unfinished `live-cloud.yml`
  runs when it cancels the group, so a dropped or rebuilt group doesn't hold the one test account.

## Which pull requests still run them, and how that's detected

`on-pull-request` is true when a changed cloud path is a `cloudflare-*` or `store-s3` adapter,
`packages/targets/`, the live suites (`packages/testing/cloudflare-live/`), the deploy command,
`live-cloud.yml` or the code that decides, probes and sweeps. These are the code the suites run
against the real service, so a failure is most likely there and should show before the queue. The
shared cloud paths, `packages/host/` and `core/ports/` (and the target contract tests), run them
only in the queue. As before, the base commit's copy of `cloud-affected` decides in CI, so a change
can't take itself off the list. Until this merges, `main`'s copy has no `on-pull-request` answer,
so for those few hours every cloud change runs them only in the queue.

In the 884 merges since 20 Nov, 72 touched a cloud path; 60 of them only through `core/ports` or
`packages/host`. About 18 touched a direct path. So about 1 in 12 pull requests stops waiting
10 to 20 minutes for the suites, and about 1 in 50 keeps waiting.

## What a live-cloud failure in the queue costs

A group whose live suites fail fails like any other: the gate fails when the suites end,
"Cancel the run on the first failure" cancels the run within a minute, GitHub drops that pull
request and rebuilds every group behind it, and each of those runs CI again (about 15 minutes,
about 16 jobs each, on the 8 slots). Unlike a failing unit test, it shows only when the suites end:
in the 17 suite runs among the last 250 pull-request runs, 12 minutes at the median and 22 at the
90th percentile, including the wait for the account. So one failure holds the queue behind it for
about 12 to 22 minutes, then reruns those groups.

How often that happens: of about 1,000 pull-request runs of `live-cloud.yml` since 20 Nov, none
failed in the suites. The 56 failed groups in HAL-14858 failed because the suites had not run on
the pull request yet, not because they failed; a group now runs its own, so that cause is gone.
The direct paths, where a failure is likeliest, are still caught on the pull request. The other
cost is time: a group with a cloud change takes as long as its suites (12 to 22 minutes) instead
of about 15, and two such groups use the account one after the other. That is about 1 in 12
groups.

## Security

The `cloudflare-live` token now reaches merge-group runs. Its environment's branch rule already
allows the queue's `gh-readonly-queue/main/*` refs. A merge group's code is approved pull requests
on top of `main`, built by GitHub in this repository; the same code reaches the nightly run once
merged. A fork's pull request that touches a cloud path still fails at once and is never queued,
so a fork's cloud change runs with the token only after a maintainer pushes the branch here, as
today. `live-cloud.yml` needs Julian's review (its header says so).

## Tests

No test was weakened or skipped. `tooling/check/src/test/ci-live-cloud-queue.test.ts` runs CI's
"Wait for the live suites" step with a stand-in `gh`: a shared-path pull request passes without
calling GitHub, a direct one needs a pass on its head, a fork fails, and a merge group needs a
pass on its own commit. It also checks `live-cloud.yml`'s `merge_group` trigger and plan, and that
a dropped group cancels its live run. `cloud-paths.test.ts` covers `isPullRequestLivePath`. New
requirement: `check.live-cloud-queue`; `check.cloud-affected` is unchanged.

## Covers

- .github/
