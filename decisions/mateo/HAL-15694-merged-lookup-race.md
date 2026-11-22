# Decision: the main-push lookup also finds a merge group whose run is still finishing

- Task: HAL-15694
- Approval: follow-up to the board's decision on HAL-15465 (Timothy, 21 Nov ~22:50 UTC, "Yes"); Liam signs this note in review
- Kind: internal

## What changes

- **The `merged` job lists every merge-group run of the pushed commit, whatever its status.** It
  used to ask only for runs with `status=success`. A group's `ci-ok` passes and the merge pushes,
  but the group's run as a whole closes a few seconds later (its trailing "Cancel the run on the
  first failure" job). For `423525a9e` the group's `ci-ok` passed at 01:54:31, its run closed at
  01:55:00 and the lookup ran at 01:55:02 to 01:55:05, before the API listed the run as a success.
  The push then ran every Linux job again (about 11 server jobs, 25 job-minutes); `500b5b23d` the
  same.
- **What counts is unchanged:** the job still reads that run's jobs and skips only when its `ci-ok`
  concluded `success`, and only the jobs that passed there. A group whose `ci-ok` failed, was
  cancelled or hasn't finished gives an empty list, so every job runs.

## Why

2 of the first 14 `main` pushes after HAL-15465 ran in full although their group was green. Taking
the run's `ci-ok` instead of the run's status closes that gap without waiting, so the job stays
as fast as before. A retry after about 30 seconds was the other option; it would slow every push
and could still miss a slow run.

## What it leaves alone

Every fall-back-to-full-run case stays: an API or `jq` error, a re-run (attempt 2 or later), the
repo variable `CI_MAIN_SKIP_MERGED` set to `off`, or no merge-group run for the commit. `merged`
still always exits 0 and isn't in `ci-ok`'s needs, so the lookup can't turn `main` red. Pull
requests and merge groups run exactly as before.

## Tests

No test was weakened or skipped. I ran the changed lookup against both commits that missed: it
finds the group for each, and names fast, build, scaffold, e2e, docs and trace for `423525a9e`
and fast, build and trace for `500b5b23d`.

## Covers

- .github/
