# Decision: routines' refused-trust line ends with halonic trust, and a secret without as quotes its fields

- Task: HAL-16137
- Approval: HAL-16137; team wording on approved command output (HAL-2282), from the words check C676 rows 38 and 41 (HAL-16129); the reviewer signs this note as the CTO
- Kind: user-visible

## What changes

- `halonic routines`, when trust refuses a file (row 38): the line ended with `halonic trust`'s
  own "Fix the address in that file, then try again." It now ends "Fix the address in that
  file, then trust the workspace with halonic trust.", with the user's own `--dir`, as the line
  for a workspace that isn't trusted names it. `halonic trust`'s own line keeps "then try
  again", where it's right.
- A sheet secret with `hosts` and no `as` (row 41, `format.integration-secret-without-as`): the
  fields and `as` are quoted, and the line says who reads it: `Secret "notes-key" has "hosts"
  but no "as", so Halonic reads it as a sign-in's client secret, which takes only "purpose".
  Add as: bearer, …`. The code, path and `keys` don't change.

The requirements, their examples and the tests that hold these lines say the new words. No
test was weakened or skipped.

## Why

C676 found that under `halonic routines`, "try again" means listing again, and the list still
says paused, because fixing the file doesn't trust the workspace; and that the secret line's bare
keys mid-sentence made "no as" read like a typo next to the shared line that quotes them.

## Covers

- cli.commands.routines.list
- format.integration-secret-without-as
