# Decision: `pnpm check` compares docsReaders with the docs tests read

- Task: HAL-19264
- Approval: the task asks for this check, follow-up to HAL-19227; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

A new `docs-readers` rule in `tooling/check/` fails `pnpm check` when a test reads a doc
under `docs/` by a path out of its package and `docsReaders` doesn't list that test's
package for the doc. It also fails on an entry naming a package whose tests don't read
the doc, or a doc that doesn't exist. It comes with its requirement `check.docs-readers`
and its tests. The regex that finds the reads moves from `affected-tests.test.ts` to
`lib/doc-reads.ts`, so the existing test and the rule share it; that test's assertions
don't change. `lib/affected-tests.ts`, a guard trust root, doesn't change.

## Why

The test "docsReaders lists every doc a test reads, with that test's package" runs only
when `tooling/check` is affected. #6159 added a CLI test reading
`docs/guides/server-engine.md` without an entry, `main` stayed green, and every later
pull request touching `tooling/check/` went red until #6377. `pnpm check` runs on every
pull request, so the pull request that adds such a test now fails itself.

The task offered a second way: select the `tooling/check` test whenever a test file
changes. That runs the whole `tooling/check` suite on most pull requests to check one
map, and it needs a change to `affected-tests.ts`, a trust root. The rule takes under a
second and leaves the trust root alone.

## Tests

No test was weakened or skipped. `src/test/docs-readers.test.ts` checks a fixture with an
unlisted doc reader (fails), the same fixture with the entry (passes), a stale entry and
the real repo.

## Covers

- tooling/check/
- check.docs-readers
