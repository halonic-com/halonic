# Decision: retire git.vcs-commits, now that the git Vcs has Create version and proposal refs

- Approval: [HAL-4114](/HAL/issues/HAL-4114) sets the git placeholders' removal as the condition for HAL-3245's git parts; the maintainer approves this note in review
- Kind: internal

## What changes

`git.vcs-commits` said that until git part 5 of HAL-3245, the git Vcs refuses `commitVersion`,
`commitWorktreeTo`, `readRef` and `deleteRef` by name. Part 5 builds them, so the requirement is
retired, and its one test in `src/vcs-commits.test.ts`, which checked the refusal, is replaced by
the tests of `git.commit-version` and `git.proposal-refs`.

The last cases leave the contract test's `notOnGitYet` list, so the list, its `beforeEach` and
`afterAll` checks and `notOnGitYet()` in `src/vcs.ts` are deleted. Every contract case now runs on
git and passes, with no case expected to fail.

## Why

The refusal was a stand-in for this part. Nothing that worked before stops working.

## Covers

- git.vcs-commits
- packages/adapters/git/src/vcs-commits.test.ts
- packages/adapters/git/src/contract.test.ts
