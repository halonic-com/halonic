# Decision: a ready pull request's ci-ok is red until the live cloud suites passed on its head

- Task: HAL-14858
- Approval: Liam approves this note in review on HAL-14858
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `live-cloud` job ("Live cloud suites passed") on a pull request
that changes a cloud path no longer only prints a notice. A draft still gets the notice. A ready
pull request from this repository looks once for a passed `live-cloud` job of `live-cloud.yml` on
its head, the same lookup the merge queue already does, and fails at once if there is none. A
fork's pull request fails with the line that a maintainer pushes the branch into this repository.
The merge-queue side doesn't change.

A new workflow, `.github/workflows/live-cloud-gate.yml`, runs when CI or Live cloud ends on a pull
request from this repository. If a `live-cloud` job passed on that head and CI's newest run there
has ended with the gate failed, it re-runs that one job, which re-runs `ci-ok` too. It checks
nothing out, holds only `actions: write`, and stops after the fourth attempt of a CI run, so it
can't loop.

## Why

In 48 hours, 56 of 124 failed merge groups failed on this job (HAL-12539, step 4): `ci-ok` was
green on the pull request, so the queue session queued it, and the group failed within a minute
and rebuilt every entry behind it. #4097 failed 12 times. Now `ci-ok` is red until the suites have
passed, so the queue session's gate (approved, `ci-ok` green on the current head) already keeps
these out, with no new check for it to read.

Failing at once instead of waiting keeps a runner free while the suites run (HAL-12419); the
re-run workflow turns it green when they pass. A separate status for the queue session was the
other option. It would leave `ci-ok` green and need its own rule in the gate.

## Tests

No test was weakened or skipped. The workflows have no unit tests; actionlint checks them in CI.

## Covers

- .github/
