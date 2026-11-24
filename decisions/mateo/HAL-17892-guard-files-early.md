# Decision: the requirement guard's file checks run at the start of a pull request's CI run

- Task: HAL-17892 (item 1 of the merge-time report on HAL-17891; Chief's go, 24 Nov)
- Approval: Chief decided on HAL-17891 / HAL-17892 (24 Nov) to move the guard's file-only checks into an early CI job; Liam signs this note in review
- Kind: internal

## What changes

- `.github/workflows/ci.yml`: a new job, `guard-files` ("Requirement guard, file checks (merge
  base's copy)"), on `ubuntu-24.04`. It needs only `changes` and has the guard job's `if` (pull
  requests that are ready and change code). It checks out the merge ref read-only, takes its first
  parent (the main commit it was built on, base-tests' `built-on`), checks that commit out,
  installs its dependencies with `pnpm install --frozen-lockfile` and no cache, and runs that
  commit's `requirement-guard.ts` with its own Node and `--skip-test-runs`, the flag
  `pnpm check:enqueue` already uses. The note's signature is checked as in the guard job
  (`--repo`, `--pr`, `--head-sha`, `--base-sha`, both commits fetched as objects only). `ci-ok`
  needs it.
- `fail-fast` doesn't cancel a pull request's run for this job (it joins the ignored list), so a
  reviewer still sees the tests' results on a pull request whose note isn't signed yet. The
  requirement `check.ci-pr-fail-fast` names it and gets one example.
- The guard job is unchanged: it still runs every check, with the test results, at the end.
- New requirement `check.ci-guard-files-early` with its test; `docs/guides/checks.md` describes
  the job.

**Julian's base-copy rule:** not changed. The new job follows it as the guard job and
`policy-base` do: only the merge base's code and dependencies run, the pull request's checkout is
only read, and pnpm never runs there.

## Why

The merge-time report (HAL-17891) found that 45% of pull requests have a red run, and 44% of
those fail only because the decision note isn't signed yet. The guard job waits for the build and
the merge base's tests, so that finding came at about 14 minutes. These checks read only files and
take about 11 s, so the finding now comes at about 2 minutes.

## Tests

No test was skipped or weakened. `ci-pr-fail-fast.test.ts` lists the new job among the jobs
`fail-fast` ignores on a pull request. `ci-guard-files-early.test.ts` (new, 5 tests): the job
needs only `changes` and has the guard job's `if`, compares with the merge ref's first parent,
runs the merge base's guard with its dependencies and Node and `--skip-test-runs`, checks the
signature for this pull request, and `ci-ok` waits for it. `tooling/check`: 103 files, 1220 tests
pass.

## Covers

- check.ci-pr-fail-fast
- .github/
- tooling/check/
