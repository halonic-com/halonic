# Decision: the watchdog checks 20 runs per sweep by default, and the requirement says so

- Task: HAL-11256
- Approval: [Liam's decision on the task](/HAL/issues/HAL-11256#comment-f8dd1646-8dea-4f05-9d61-b19e0cd41784); Liam signs this note as the CTO
- Kind: internal

## What changes

`packages/adapters/cloudflare-durable/requirements/watchdog-limits.md` said a sweep checks 40 runs by default. It now says 20, which is what `defaultMaxRunsPerSweep` in `src/watchdog.ts` and the README already say, and gives the reason in its Rationale. No code changes.

## Why

The free plan allows 50 calls per Worker invocation. A sweep also reads the run list and the routines, and checks each run and wakes each stuck one, so 20 runs make at most 2 + 20 * 2 = 42 calls. 40 runs would pass the limit. The code and README were right and the requirement was wrong.

## Tests

No test was skipped or weakened. A new test in `watchdog.test.ts` builds a watchdog without a limit and checks that it wakes exactly 20 of 100 stuck runs and defers 80. The older test compares against `defaultMaxRunsPerSweep`, so it would pass for any value.

## Covers

- packages/adapters/cloudflare-durable/requirements/
