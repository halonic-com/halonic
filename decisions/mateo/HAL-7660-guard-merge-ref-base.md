# Decision: after a walk-back, the requirement guard still compares files with the commit the merge ref was built on

- Task: HAL-7660 (follow-up to HAL-5568)
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the job "Merge base's tests (no cache)" gets a second output, `built-on`: the main commit the merge ref was built on (the first parent of the merge commit, as since HAL-5568). Its `sha` output stays the commit whose tests ran. The two differ only when main was red and the job walked back to an older green commit.

When they differ, the guard job checks out `built-on` as well (read only, no install) and passes it to the guard as `--built-on`. The guard (`tooling/check/src/cli/requirement-guard.ts`) then compares the pull request's files with that commit, and takes only the test results from the green commit. `checkTestRuns` leaves out, on both sides, the tests in files main changed between the green commit and `built-on`. A guard older than this change ignores the flag, so the rollout needs no special step.

`tooling/check` gets a requirement (`check.guard-base-after-walk-back`) and `guard-walk-back.test.ts`. `docs/guides/broken-main.md` says what the guard compares after a walk-back.

## Why

On #2226 at `f22d5d5`, main's newest commit `421608a` had a failing CLI test, so "Merge base's tests" walked back ten commits to the green `8597fb4`. The guard then compared the merge ref, which holds all of main up to `421608a`, with `8597fb4`, and blamed #2226 for what #2038 and other commits on main changed in between: the requirements `cli.doctor-report` and `cli.sandbox-gate`, and the test count of `apps/cli/src/commands/runs/show.test.ts` (11 against 15). Every pull request opened while main is red got the same false findings.

The task describes the cause as the merge base. The switch to the merge ref's first parent was already done in HAL-5568; the remaining gap was the walk-back, which is what this fixes.

No check is removed or weakened: without a walk-back the guard runs exactly as before. With one, it still checks every file and requirement the pull request changes, and every test file main left alone.

## Tests

No test was skipped or weakened. `guard-walk-back.test.ts` builds the #2226 case: a green commit, a later main commit that edits a requirement and cuts tests from a test file, and a pull request that touches neither. With the green commit's results and `built-on`'s files the guard reports nothing; with the green commit alone it reports both findings; a test the pull request drops from an unchanged file, or a requirement it edits, is still reported. The test fails on the old `checkTestRuns`.

## Covers

- .github/
- tooling/check/
