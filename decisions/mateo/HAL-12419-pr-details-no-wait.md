# Decision: PR details no longer holds a runner while CI runs

- Approval: the task asks for this change (HAL-12419); Liam approves this note in review
- Kind: internal

## What changes

In `.github/workflows/pr-details.yml`, the `Pull request details` job no longer waits for CI's run
to end. If the run has ended, it re-runs CI's failed title, leak or coverage-floor jobs at once, as
before. If the run is still going, it ends. A new job, `Re-run CI after a details change`, starts on
`workflow_run` when CI ends. For a failed pull request run from this repository, with a failed
title, leak or coverage-floor job, it re-runs the failed jobs if the pull request's details changed
after that attempt started: a later `PR details` run on the same head says they did. It checks out
nothing and runs no repository code. Its token can only re-run workflows (`actions: write`). The
`Pull request details` job's timeout goes from 75 to 5 minutes.

## Why

The job held a hosted runner while it slept, up to 75 minutes. Since 07:00 UTC on 18 Nov it held
696 runner-minutes, and at 11:15 five of the fifteen running jobs were this one. Runners are shared
with the merge queue, whose build job waited 6 to 22 minutes for one (HAL-12419).

## Tests

No test was weakened or skipped. The same three CI jobs are re-run in the same cases. The
`created=>` filter of the runs query was checked against the API.

## Covers

- .github/
