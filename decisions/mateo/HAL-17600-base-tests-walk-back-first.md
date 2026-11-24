# Decision: the merge base's tests walk back first when main's push run already failed

- Task: HAL-17600
- Approval: HAL-17600 (found on HAL-17437, #5631); Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, `base-tests` ("Merge base's tests (no cache)") gets a step before
pnpm and the install: if the merge base's own `push` CI run on `main` ended as `failure` or
`timed_out`, it switches to the newest commit within 20 on `main`'s first-parent history whose push
run passed, warns `baseline-walked-back`, and tests only that commit. With no green commit within
20 it fails at once with the same message as the walk-back after the tests. A push run that is
still running, was cancelled or doesn't exist yet changes nothing: the merge base is tested, and
the walk-back after the tests stays as the fallback.

`tooling/check` gets the requirement `check.base-tests-walk-back-first` and
`ci-base-tests-walk-back.test.ts`, which runs the step's script with stand-in `gh` and `git`.
`docs/guides/broken-main.md` says when the job walks back first.

## Why

On #5631 (run 45400038247) the merge base `bc7d80e62` was red. The job ran every package without a
cache (about 21 minutes), saw the failures, walked back and started a second full run, and hit the
45-minute limit. The guard then failed `ci-ok`, and a rerun reused the same red merge base. Main's
push run had already failed, so the first run was wasted. Walking back first picks the same commit
the walk-back after the tests would pick, and runs every package once.

No check is loosened: the baseline is still a commit on `main` with a green push run, every package
is tested on it, and the guard compares files with the commit the merge ref was built on (HAL-7660).

## Covers

- .github/
- tooling/check/
