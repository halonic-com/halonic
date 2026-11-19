# Decision: affected tests list a moved file by both its paths

- Task: HAL-13851
- Approval: Julian's follow-up from the #4070 review (HAL-13845). `tooling/check/src/lib/affected-tests.ts` is a guard trust root, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible

## What changes

- `tooling/check/src/lib/affected-tests.ts`: `selectTests` runs
  `git diff --name-only --no-renames <base>...<head>`. Git detects renames by default, so a moved
  file was listed only by its new path, and the package it left (and that package's dependents)
  was not selected. With `--no-renames` a move is listed as a deletion and an addition, so both
  packages are selected. The same holds for a requirement file moved between packages, which
  #4070's "both sides of the change" relies on.

## Why

On `main`, `d1e1e2f60` moved `failure-line.ts` from `packages/studio/features/google-setup` to
`packages/studio/shell`. `--name-only` lists only the shell path; `--no-renames` lists both. The
merge queue still tests everything, so this could never let a pull request through wrongly, but a
pull request's own run tested less than it should.

## Tests

No test was weakened or skipped. A new test moves a file between two packages in a real git
repo and checks that `selectTests` selects both.

## Covers

- tooling/check/
- check.affected-tests
