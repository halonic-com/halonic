# Decision: on Windows, the sandbox packages' typecheck and test step runs two tasks at a time with 30 s per test

- Task: HAL-17217 (sandbox-srt's Windows deny-placeholder tests timed out on #5561 and on `main`)
- Approval: Liam approves this note in review on HAL-17217 (CI workflows are the guard's path; internal CI load, no board card)
- Kind: internal

## What changes

On the Windows leg of "Sandbox packages on Windows" in `.github/workflows/ci.yml`, the "Typecheck and test" step gets `TURBO_CONCURRENCY=2` and `HALONIC_TEST_TIMEOUT=30000`. The macOS leg keeps the workflow's settings.

## Why

The step ran the sandbox packages' typechecks and tests ten at a time on a four-core runner with Vitest's 5 s timeout. Tests that only make and remove a few empty files then took 2 to 5 s and timed out, a different test on each run (job 138188253460). The job's next step, "Test the Windows packages", has had the same two settings since HAL-11709 for the same reason. No check is removed or weakened: the same tests run and assert the same things, they only get room to finish. With this change, the job passed on this pull request.

## Covers

- .github/
