# Decision: the merge base's tests get 45 minutes, and the guard says when they stopped early

- Task: HAL-15369
- Approval: HAL-15369 (found on HAL-15223); Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TvUiPYpkXVDbVs9+vlOP1eJY2natFbfhAHVCcDpBn0QWyJxYVM5Ugjp6Tc8Oy4KSVrofCs34LIIZWdQJ6UaCBQ==

## What changes

In `.github/workflows/ci.yml`:

- **`base-tests` ("Merge base's tests (no cache)") gets `timeout-minutes: 45`** instead of 20.
- **The guard job stops with a clear error when `base-tests` didn't end as `success`.** Its test step
  has `continue-on-error`, so failing tests leave the job green; anything else means it stopped early,
  most often at its time limit. The guard then says so and asks for a rerun, instead of reporting
  that the merge base's `apps/cli/test-results/vitest.json` is missing.

No check is loosened: the guard still fails the pull request in that case, only with the right reason.

## Why

A pull request that changes `ci.yml` makes affected-tests select every package, and the merge base
then runs every package's tests without a cache. On 21 Nov that took 13–19 minutes (#4275, #4529,
#4388) and passed 20 on a slow runner: #4528 timed out twice in a row (runs 44940414047 and
44945575310). The walk-back to main's newest green commit runs every package a second time, so
45 minutes covers both runs. The limit costs nothing when the job ends early.

## Covers

- .github/
