# Decision: the guard ignores an expect-count drop that only vi.waitFor's retries can explain

- Task: HAL-6369, found on halonic#1903 (HAL-4975)
- Approval: Liam decided it as the guard's owner on [HAL-6369](/HAL/issues/HAL-6369), and signs this note; Julian reviews the pull request, and Liam signs again if the review changes it
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:e12ScmYkWzYoOAojPDtDtxk0+PaOvQtvOPUVlMpUsxx9E7IiBTjDFzEBFO482zelJ0qE3vRzb4QbKp/N7S/5Dw==

## What changes

The requirement guard no longer reports fewer `expect` calls for a requirement when only
`vi.waitFor`'s retries can explain the drop: one of its test files imports `vi` and calls
`vi.waitFor`, the pull request edits none of its test files, none of its tests drops to 0 calls,
and its test files without `vi.waitFor` make as many calls as before. Everything else stays:
fewer tests per requirement or per file, deleted test files, and a drop after the requirement's
own test file was edited are still reported. `check.guard-fewer-assertions` says so in four new
examples.

Julian's review narrowed the first version, which skipped any drop for such a requirement: a
retry runs its callback at least once, so a drop to 0 isn't timing, and a test file without
`vi.waitFor` has a stable count. The `vi` import keeps a `vi.waitFor` that only appears in a
string or a comment, like in the guard's own tests, from counting.

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
