# Decision: retire git.vcs-worktrees, now that the git Vcs has worktrees and patches

- Approval: [HAL-4114](/HAL/issues/HAL-4114) sets this as the condition for git part 4 of HAL-3245; the maintainer approves this note in review
- Kind: internal

## What changes

`git.vcs-worktrees` said that until git part 4 of HAL-3245, the git Vcs refuses `addWorktree`,
`removeWorktree`, `listWorktrees`, `diffBetween` and `applyPatch` by name. Part 4 builds them, so
the requirement is retired, and its one test in `src/vcs-worktrees.test.ts`, which checked the
refusal, is replaced by the tests of the four requirements that say what the methods do:
`git.worktrees`, `git.worktree-git-folder-not-trusted`, `git.diff-between` and `git.apply-patch`.

The worktree and patch cases leave the contract test's list of cases git can't pass yet
(`notOnGitYet` in `src/contract.test.ts`), and the harness's `noWorktreesYet` and
`plant.worktreeGitFile` stubs give way to the real members. All 267 contract cases now run on git
and pass. The list keeps only the Create version and proposal ref cases, which git part 5 builds;
part 5 deletes the list.

## Why

The refusal was a stand-in for this part, written so no caller got half a worktree before the
`.git`-file rule (HAL-3188) was in. Nothing that worked before stops working.

## Covers

- git.vcs-worktrees
- packages/adapters/git/src/vcs-worktrees.test.ts
