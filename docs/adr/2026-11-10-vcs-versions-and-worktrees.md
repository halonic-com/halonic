# The Vcs port reads versions, takes snapshots, renames and keeps worktrees (v2)

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

The board decided the save model on HAL-1102: the Studio saves by itself,
versions are git commits, and the assistant and agents work in worktrees and
come back with a proposal. Runs read the latest version, not what is on disk
(save model 2.2–2.3), so the engine needs to read a file at a commit. A
proposal is a diff against what was saved when it started, so it needs a
commit of the saved files that doesn't disturb the person's branch or
staged changes. Rename should keep an item's history. Version 1 of the port
could do none of this. The routing note on HAL-3236 (task 1) gives the
shapes.

## Decision

**`Vcs` version 2 adds** `snapshot()`, `readAt(version, path)`,
`listAt(version, dir?)` and `rename(from, to)`, and the worktree and patch
methods: `addWorktree(version)`, `removeWorktree(id)`, `listWorktrees()`,
`diffBetween(version, worktreeId)` and `applyPatch(patch, { reverse })`,
and the methods behind Create version and run proposals (HAL-3267, engine
answer points 2 and 3): `commitVersion({ message, include?, exclude })`,
`commitWorktreeTo(worktreeId, ref, { parent })`, `readRef(ref)` and
`deleteRef(ref)`. They landed in three pull requests before any release,
under one bump; version 2 is complete with the third (HAL-3354).

**Worktrees live outside the workspace folder**, detached at a version, so
the Studio's file tree and watcher never see them. Reading one never trusts
the `.git` file in its folder, which whatever ran there could have
rewritten (the worktree side of HAL-3188). **`applyPatch` is all or
nothing** and touches the working tree only: discarding one hunk is
`applyPatch(hunk, { reverse: true })`.

**A version is a full commit id and nothing else.** `checkCommitId` refuses
branch names, `HEAD`, `@{-1}`, short ids and anything starting with `-`
before git runs. Callers hold only ids that `snapshot`, `commit` or `log`
gave them, so nothing resolves against whatever the repository holds at that
moment, and no version can be read as an option.

**Create version commits what is on disk, except what it is told to leave
out**, which keeps its content at HEAD and stays a change. Unlike
`git commit -- <path>`, which commits the working-tree content of every
tracked path it names, a left-out file never reaches the version, even when
it is tracked and changed. Private entries never get in, and the working
tree is never touched. It refuses when every change is left out, rather
than making an empty commit.

**A run's proposal lives on a hidden ref**, `refs/halonic/proposals/<id>`,
and on no branch. `checkProposalRef` refuses every other ref name, so these
methods can never move a branch or `HEAD`. A ref is created only when it
doesn't exist yet, so a proposal is never overwritten, and deleting a
missing ref is refused, so a caller finds out when it deleted the wrong one.

**A snapshot is a commit on no branch** of the files on disk, new files
included, ignored files and private entries left out. HEAD, the branch, the
index and the working tree don't change. Leaving out `.env` and the other
private entries, even when `.gitignore` doesn't, keeps keys out of the
worktrees the assistant and agents work in.

**Version 2** because every adapter must implement the new methods: under
the port freeze ([port list and versions](2026-11-07-port-list-and-versions.md))
that is breaking. The memory Vcs and the dry-run Vcs implement them in the
same change; the git adapter (HAL-2607) implements them when it lands.

## Consequences

- The engine can build a `DefinitionSource` at a commit on `readAt` and
  `listAt` (HAL-3246), and `ProposalService` can start from `snapshot()`
  (HAL-3248).
- The Studio's Create version and the run path's proposals (HAL-3248)
  build on `commitVersion` and the proposal refs.
- `ports.vcs-commit-ref`, `ports.vcs-proposal-ref`, `memory.vcs-versions`,
  `memory.vcs-worktrees`, `memory.vcs-commits` and the three
  `memory.dry-run-vcs-*` requirements keep the behaviour true; Julian's
  contract cases (HAL-3265, HAL-3317) hold every adapter to it.
- A snapshot nobody keeps is an unreachable commit; git's own `gc` removes
  it after its usual grace period. A worktree at a snapshot keeps it.
