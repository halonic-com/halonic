# Decision: the guard compares only the affected packages, and the switch turns on

- Task: HAL-12539
- Approval: the task asks for this change (HAL-12539, step 1b, decided on HAL-5327). `tooling/check/src/guard/` and `requirement-guard.ts` are trust roots, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible

## What changes

- `tooling/check/src/lib/affected-tests.ts`: `selectTests` runs `git diff <base>...<head>` and
  the selection in one place, for the build job, the merge base's tests and the guard. The
  selection now also follows "the tests of package X verify a requirement of package Y": three
  packages do that without depending on Y (`adapter-http-node`, `adapter-tool-approval-kit`,
  `adapter-workspace-models`), and the trace check needs their tests to prove Y's requirements.
  When git can't compare the commits, every package is selected. The guard now imports this
  file, so it joins the guard's trust roots in `note-check.ts`.
- The requirement guard (`check.guard-needs-test-results`): with `--affected-base <commit>` it
  works the affected set out itself with `selectTests` and the same commit as the test jobs (the
  merge ref's first parent). It leaves the other packages out on both sides, whatever result
  files they have. It doesn't read "not affected" from a missing file: an affected package
  without a readable result file still fails, and a deleted test file is still found in any
  package.
- The trace check (`check.trace-tests-name-live-requirements`): with `--package`, a test in
  scope may verify a requirement of a package outside it. That requirement is looked up, not
  reported as missing. Before, a scoped trace reported it as "doesn't exist".
- `.github/workflows/ci.yml`: `AFFECTED_TESTS` is `"on"`. The merge base's tests run the merge
  base's own copy of affected-tests on the merge ref and test only those packages (the walk-back
  to an older green commit still tests everything). The guard job fetches the merge ref's first
  parent, scopes trace to the affected folders and passes `--affected-base` to the guard. Changes
  to the root files, `.github/workflows/`, `.github/actions/` and `tooling/check/` still test
  every package, so this pull request itself runs the full suite.

## Why

Step 1b of staged CI in one `main` (HAL-12539), with Liam's rules for the guard change: the guard
works out the affected set itself, with the same command and the same ref as the test jobs; an
affected package with a missing result file still fails; root-file changes run the full suite.
The merge queue and `main` still test every package.

## Tests

No test was weakened or skipped. The guard, trace and selection changes have their own tests.

## Covers

- .github/
- tooling/check/
- check.guard-needs-test-results
- check.trace-tests-name-live-requirements
- check.affected-tests
