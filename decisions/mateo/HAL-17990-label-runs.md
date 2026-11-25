# Decision: no label starts a CI run; adding fast-track re-runs the newest one

- Task: HAL-17990 (critical: every labelled pull request showed `ci-ok` as "expected" and couldn't be queued)
- Approval: Chief's fix plan on HAL-17990 (stop non-`fast-track` labels creating a `ci.yml` run, move the fast-track re-run elsewhere); Liam signs this note in review. The hook and the gate don't change, so Julian's C1–C8 check isn't needed
- Kind: internal

## What changes

- `.github/workflows/ci.yml`:
  - `pull_request` loses the `labeled` type again. The label-run parts of HAL-17672 go with it:
    the `run-name`, the `label-<run id>` concurrency group, the
    `(github.event.action != 'labeled' || github.event.label.name == 'fast-track')` guard on each
    job, and `ci-ok`'s "label added, nothing to run" name.
  - `pick-runner` reads the pull request's labels from the API (new `labels` step,
    `pull-requests: read`, `continue-on-error`), and falls back to the event's labels when the
    read fails.
- `.github/workflows/pr-details.yml`: when `fast-track` is added to a pull request from our own
  branch, a new step finds the newest `ci.yml` run on the head (passing over old label runs),
  cancels it if it is still running (waiting up to 3 minutes for it to end), and re-runs it in
  full. The failed-jobs re-run step skips after it. A `fast-track` label gets its own
  concurrency group, so another label added at the same moment can't cancel it.
- The requirement `check.ci-self-hosted-routing`: its label paragraph and two examples.
- `infra/ci-runner/README.md`: how adding the label reaches the fast pool now.

## Why

GitHub counts only a commit's newest run of a workflow for its required checks. With `labeled`
as a trigger, any label (`built-on:paperclip`, which the Built-on label workflow adds itself, for
one) started a `ci.yml` run that skipped every job and reported only
`ci-ok (label added, nothing to run)`. That run replaced the real one, which had the green
`ci-ok`, so the required check showed "expected" and GitHub refused to queue the pull request.
`on:` can't filter by label name, so the only way to keep other labels from creating a run is to
drop `labeled` from `ci.yml`.

A re-run keeps the old event, which has no `fast-track` label, so the routing used to send it to
GitHub's runners (the reason HAL-17672 used `labeled`). `pick-runner` now reads the labels as
they are when it runs, so a full re-run sees the label. `pr-details.yml` already holds an
`actions: write` token and re-runs CI after a details change, so the fast-track re-run goes
there instead of a new workflow.

What stays: the old label runs on open pull requests are still there, so `pr-details.yml` and
`live-cloud-gate.yml` keep passing them over by name. A re-run uses the workflow file of the run
it repeats, so a pull request whose newest run predates this change gets the fast pool only from
its next push.

## Tests

No test was skipped or weakened against the behaviour that stays. In
`tooling/check/src/test/ci-self-hosted-routing.test.ts` the two HAL-17672 tests for the label run
(the trigger and run name, every job skipping) are replaced, because that behaviour is removed:

- no label starts a `ci.yml` run, and no job condition mentions `labeled`;
- `pick-runner` reads the current labels with a fallback to the event's;
- `pr-details.yml` re-runs the newest run in full when `fast-track` is added, in its own
  concurrency group.

The test that `pr-details.yml` and `live-cloud-gate.yml` pass over label runs stays.
`pick-runner`'s condition loses the guard.

## Covers

- check.ci-self-hosted-routing
- .github/
- tooling/check/
