# Decision: the build job uploads per-task Turbo timings

- Approval: the plan on HAL-9808 (Liam approved it, step 0); Liam approves this note in review on HAL-9808 and signs it
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `Task timings` step of the `Typecheck, lint, test, build`
job also writes a table of time per task type to the job summary and uploads
`turbo-task-timings`, kept for 30 days. The file holds only the task ID, task, package, cache
status, start, end and exit code of each task. Turbo's full summary also holds the runner's
user, git details and hashed environment variables, so it is not uploaded. The upload can't
fail the job. No trigger, right, runner, secret or check changes.

## Why

HAL-9808 splits the cold pull-request build over parallel jobs. The split needs real time per
task, which no run recorded before.

## Tests

No test was weakened or skipped. The cold probe runs on #3654 used this step.

## Covers

- .github/
