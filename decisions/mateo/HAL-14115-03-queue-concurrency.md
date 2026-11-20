# Decision: a merge group's runs are keyed on its commit, and the build shards time out at 15 minutes

- Approval: the board's decision on HAL-14115 (20 Nov 17:20, "1, 3 and 4 yes", step 3, a queue fix under the HAL-14331 freeze); it changes `guard-notes.yml`, a trust root of the guard, so Liam and Julian both sign it as guardians
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zAfI2zIUH0/0iJEC7zNNmnko+iq91nVZk9asT4g0EAxWa2Y+3p2SInCXHGo/jO4g6SQFJPZ7URjHPX64Ae2tAQ==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:ISxP9NAPGT1Elbjyaz4SzEZ9njQQQEpgtkqsCc6p9IcX/H7HvV1OCxFItY/7HvLYkphxSpC+aBfuw8O94F8pCg==

## What changes

- `.github/workflows/ci.yml`: the workflow's concurrency group for a `merge_group` run is
  `ci-<merge group head sha>` instead of `ci-<ref>`. Pull requests (`ci-<number>`) and pushes
  (`ci-<ref>`) don't change, so main's pushes still run one at a time.
- `.github/workflows/guard-notes.yml`: the same for its `merge_group` runs
  (`guard-notes-<head sha>` instead of `guard-notes-<head ref>`).
- `ci.yml`: the build shards' `timeout-minutes` goes from 25 to 15.

No trigger, runner, right or secret changes. The shards and the `trace` job don't change.

## Why

- **Concurrency.** A merge group's branch name is `gh-readonly-queue/main/pr-<n>-<base sha>`.
  When the queue rebuilds a group while `main` hasn't moved, the name repeats. CI's group
  doesn't cancel outside pull requests, so the new run waited "pending" behind the dead one
  until someone cancelled it by hand (20 Nov 10:26, #3703). The head sha is new for every
  group, so a group never waits on another. From 16:00 to 16:45 on 20 Nov, all 38
  merge-group CI runs had their own ref and started within a second; the slow patch from
  16:19 to 16:40 was jobs waiting for runners, not runs waiting on a concurrency group.
  `Built-on label` has no concurrency group, `PR details` keys on the `workflow_run` id and
  `Live cloud` and `Leak terms` don't run in the queue.
- **Timeout.** Since the split, the longest shard took 7.3 minutes (244 shard jobs on
  pull requests, pushes and the merge queue, 20 Nov 15:55–17:30); median 4.7 to 5.8 minutes.
  15 minutes is twice the longest, and a hung shard frees its runner 10 minutes sooner.
- **Not changed: the shard split.** The slowest shard differs from group to group (each of
  the four was slowest in some groups), and the medians are within about a minute. Moving a
  package would trade one shard's noise for another's.
- **Not changed: `trace`.** It needs every shard's test results, and a test in one shard may
  verify a requirement of a package in another, so it can't run per shard. It adds a median
  0.8 minutes after the last shard. Starting it beside the shards to wait for their results
  would save about half a minute but hold one more runner for the whole group, and runners
  are what the queue waits for now.

## Tests

No test changes. The concurrency expressions only add `merge_group.head_sha`, which GitHub
sets on every `merge_group` event.

## Covers

- .github/
