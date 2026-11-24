# Decision: a dated cutoff for a deny term added after older commits

- Approval: the board asked for it on HAL-17292 (for HAL-16851); Liam wrote it, so Julian reviews
  and signs as the security reviewer
- Kind: internal

## What changes

- `tooling/check/leak-allow.txt` accepts a new line,
  `term-cutoff entry:<n> before:<UTC date> <reason>`. It names a term of the deny-terms list by its
  position, never by its text or a hash of it.
- Only the full history scan (`--all`) reads these lines: a match of that one term passes in a
  commit whose committer date is before the cutoff. Every other term still fails anywhere, the same
  term still fails in later commits, in the working tree and in branch and tag names, and a cutoff
  that names a position past the end of the list fails the scan.
- The git hooks, pull request scans, the merge queue and pushes to `main` ignore cutoffs, so they
  work exactly as before.
- The file gets cutoffs for entries 7 and 8, from 2026-11-24 07:00 UTC.
- Tests are added in `src/leaks/term-cutoffs.test.ts` and `src/cli/leaks.test.ts`; none is removed
  or weakened. `docs/guides/leak-guard.md` describes the new line.

## Why

Two terms are about to be added to the list, and they appear in old history that can't be
rewritten. Without a cutoff the weekly full scan would fail every week. A position instead of a
hash keeps the term out of the repo: a hash of a short, guessable word can be reversed by trying
words.

## Covers

- tooling/check/
