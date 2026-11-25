# Decision: a label starts no ci.yml run; fast-track restarts the pull request's run instead

- Task: HAL-17992 (found by the board session on HAL-17891, 25 Nov)
- Approval: the task asks for option (a), no `ci.yml` run for a label other than `fast-track`, as the preferred fix; Liam signs this note in review. The hook and the gate don't change
- Kind: internal

## What changes

- `.github/workflows/ci.yml`:
  - `pull_request` loses the `labeled` type again (HAL-17672 added it). The label run's run name,
    its concurrency group, its `ci-ok (label added, nothing to run)` name and the condition
    `(github.event.action != 'labeled' || github.event.label.name == 'fast-track')` on ten jobs and
    one step go (`signature-reuse`, from HAL-17896, is left with no condition, and `changes` with
    `!cancelled()` alone).
  - `pick-runner` reads the pull request's labels from GitHub when it starts
    (`pull-requests: read`), and falls back to the event's labels when that read fails.
- `.github/workflows/fast-track-label.yml` (new): on `labeled`, only for `fast-track` on a pull
  request a person opened from our own branch, it takes the head's newest `ci.yml` pull request
  run; a run that passed is left alone; a going run is cancelled and waited for (up to 5 minutes);
  then every job is re-run. Its one permission is `actions: write`; it checks out nothing.
- `pr-details.yml` and `live-cloud-gate.yml` keep passing over a run named "A label was added:
  nothing to run": runs made before this change still exist on open pull requests. Only their
  comments change.
- Requirements: the new `check.ci-label-keeps-ci-ok`. In `check.ci-self-hosted-routing` the
  label-run paragraph and its two examples are replaced by a pointer to the new requirement and
  one example for the live labels.
- `infra/ci-runner/README.md` says how adding the label now reaches the fast pool.

## Why

GitHub reads a required check from a workflow's newest run on the head. Since #5703 every label
started a `ci.yml` run, and for any label but `fast-track` that run had no job named `ci-ok`, so
`ci-ok` was "expected" and GitHub refused to queue the pull request. `gh pr create --label
built-on:paperclip` adds a label to every pull request we open, so most of the queue was hit.

Option (b) of the task, a label run whose `ci-ok` copies the real run's, would have to wait for the
real run to end, and would stay red after a "Re-run failed jobs" turned the real run green, since
it is the newer run. Starting no run at all avoids both. GitHub has no filter by label name, so the
`fast-track` case moves to a workflow of its own, whose runs hold no `ci-ok` (pr-details.yml runs
on `labeled` too and never hid it).

That workflow can't start a `pull_request` run itself: events from the job's token start no
workflow. It re-runs the existing run instead. A re-run reuses the old event, whose labels lack
`fast-track`, so `pick-runner` now reads the labels as they are; the hook already did. A re-run of
every job, not only the failed ones, is needed, because re-running failed jobs keeps
`pick-runner`'s old answer.

## Tests

The three label-run tests in `tooling/check/src/test/ci-self-hosted-routing.test.ts` are removed
with the behaviour they tested; their helpers (`jobBlocks`, `field`, `needsOf`, `whyItSkips`) go
with them, and the `pick-runner` condition no longer lists the label guard. No other test was
skipped or weakened. New:

- `tooling/check/src/test/ci-label-keeps-ci-ok.test.ts`: `ci.yml` starts on no label, no other
  workflow has a job named `ci-ok`, `fast-track-label.yml`'s trigger, condition and permission,
  and its order: leave a passed run, cancel, wait, re-run every job;
- the routing test checks that `pick-runner` reads the labels live, read-only, with the event's
  labels as the fallback;
- `ci-pr-signature-reuse.test.ts` now expects `signature-reuse` to have no condition and `changes`
  to have `!cancelled()` alone, instead of the label guard. It still checks that the job runs
  wherever `changes` runs.

## Covers

- check.ci-self-hosted-routing
- check.ci-label-keeps-ci-ok
- check.ci-pr-signature-reuse
- tooling/check/src/test/ci-self-hosted-routing.test.ts
- .github/
- tooling/check/
