# Decision: a switch for affected-only tests on pull requests, off for now

- Task: HAL-12539
- Approval: the task asks for this change (HAL-12539, step 1a, decided on HAL-5327); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NtU2hfIhkqaagQyVgy7h2KVik65HcBILOapO36owp0Ks35F+r/qxCHLjTkRDdIli6o4D010L5wHy8KYc6SL5CA==

## What changes

- New `tooling/check/src/lib/affected-tests.ts` and `tooling/check/src/cli/affected-tests.ts`
  with the requirement `check.affected-tests`: from the files a pull request changes, they
  select the packages whose tests it needs (the changed packages and their dependents), or every
  package when a file all tests depend on changed (lockfile, root manifest, workspace file,
  Turbo, Biome, `tooling/config`, `tooling/check`, `testing/spec`, workflows and actions) or
  a file outside every package that isn't docs.
- In `.github/workflows/ci.yml`, the switch `AFFECTED_TESTS`, set to `"off"`. Only when it is
  `"on"`, a pull request's build job compares against the merge ref's first parent and runs
  `test` for the selected packages only; typecheck, lint and build still run for every package.
  The merge queue and `main` are untouched. The build job's checkout fetches 2 commits on pull
  requests so the first parent is there, and the task timings step lists every Turbo run.

## Why

Step 1 of staged CI in one `main` (HAL-12539): a pull request tests what it can break, and the
merge queue still tests everything. Over the last 200 commits on `main`, the selection would have
tested 26 of 99 packages on average (median 4), and every package for 27 of them.

With the switch off, nothing a pull request runs changes. It stays off until step 1b: the merge
base's tests select the same packages, and the requirement guard learns "not affected"
(a guard change, reviewed as one).

## Tests

No test was weakened or skipped. The selection has its own tests.

## Covers

- .github/
- tooling/check/
