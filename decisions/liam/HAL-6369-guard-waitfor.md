# Decision: the guard ignores an expect-count drop that only vi.waitFor's retries can explain

- Task: HAL-6369, found on halonic#1903 (HAL-4975)
- Approval: Liam decided it as the guard's owner on [HAL-6369](/HAL/issues/HAL-6369), and signs this note; Julian reviews the pull request, and Liam signs again if the review changes it
- Kind: internal

## What changes

The requirement guard no longer reports fewer `expect` calls for a requirement when one of its
test files calls `vi.waitFor` and the pull request edits none of its test files. Everything else
stays: fewer tests per requirement or per file, deleted test files, and a drop after the
requirement's own test file was edited are still reported. `check.guard-fewer-assertions` says
so in two new examples.

## Why

`vi.waitFor` runs its callback, `expect` calls included, again until it passes, so the count
depends on how fast the runner was. On halonic#1903 the tests of `cli.commands.routines.watch`
made 230 calls against 248 on the merge base, though neither the pull request nor `main` had
touched them. A pull request can't fix a count it doesn't control, and a decision note for it
would be noise.

The better fix counts only the passing attempt inside `verifies()`, so the count is stable and
the guard keeps comparing it. That lives in `packages/testing/spec/`, which needs a
`user-visible` note no key can sign until the board pins a user key (HAL-3434). It is ready on
the branch `liam/HAL-6369-spec-waitfor-count`; once it lands, this exception can go.

## Covers

- check.guard-fewer-assertions
- tooling/check/
