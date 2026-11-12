# Decision: after a walk-back, the guard compares files with the merge base

- Task: HAL-7633 (found on HAL-6791)
- Approval: the task [HAL-7633](/HAL/issues/HAL-7633) asks for this fix; the maintainer (Liam) approves this note. A guard change is signed as `internal` under the interim rule from [HAL-5221](/HAL/issues/HAL-5221), until a user key is pinned
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TSba11j8MHnG9khvNCBS/hYWV0f06COmsm3xr9QOoHP/0uYP65LOqXlURllKW2ZiJpbfEpld9vIkswgyKHXjDQ==

## What changes

In `.github/workflows/ci.yml`: `base-tests` also reports `merge-base`, the commit the merge ref was built on. When its tests walked back to an older green commit, the guard job checks out the merge base as well (only read, nothing installed or run) and passes it as `--base`, with the walked-back commit as `--test-base`. Without a walk-back nothing changes.

In `tooling/check/`: the guard learns `--test-base`. Only the test-runs check reads it, for the baseline's results; every other check, and the test-runs check's deleted files and touched requirements, compare with `--base`. New requirement `check.guard-walked-back-baseline`; no existing guard rule changes.

## Why

When a flaky test failed on the merge base, the guard diffed the walked-back commit against the pull request and blamed every requirement and guarded path main changed in between on the pull request (#2170 and #2230). The baseline still comes from the walked-back commit, so a red main can't weaken the comparison. One gap stays: a drop in test counts that main itself made between the two commits is still reported; `docs/guides/broken-main.md` says so.

## Covers

- .github/
- tooling/check/
