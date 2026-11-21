# Decision: on our own CI server, the build runs at most 4 Turbo tasks with 2 test workers each

- Task: HAL-15357 (follow-up from HAL-15286: the large slots now have 6 CPUs and 10 GB)
- Approval: Liam agreed the new defaults on HAL-15286 (21 Nov 20:50) and signs this note in review
- Kind: internal

## What changes

- The build job's "Run every task through the cache" step now defaults `TURBO_CONCURRENCY` to 4
  (was 6) and `HALONIC_TEST_WORKERS` to 2 (was 3) when `runner.environment` is `self-hosted`.
  The repo variables `CI_SELF_HOSTED_TURBO_CONCURRENCY` and `CI_SELF_HOSTED_TEST_WORKERS` still
  override both. On `ubuntu-24.04` nothing changes.
- The comment above them and `docs/guides/checks.md` say 6 CPUs and 10 GB instead of 12 CPUs and
  16 GB.

## Why

HAL-15286 cut each large slot from 12 CPUs and 16 GB to 6 CPUs and 10 GB (#4574). The old defaults
allowed 6 tasks with 3 test workers each, up to 18 workers next to the `tsc` processes, in 10 GB
instead of 16. That is the load that ran `studio-features` out of memory in HAL-15167. Four tasks
with two workers each, at most 8 workers, fit 6 CPUs and keep the memory per worker at least as
high as before. Nobody but the board can set the repo variables, so the defaults carry the fix.

## Tests

No test was weakened or skipped. No test reads these two numbers; the `ci-self-hosted-routing`
test checks the jobs' runner expressions, which don't change.

## Covers

- .github/
