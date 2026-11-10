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
`diffBetween(version, worktreeId)` and `applyPatch(patch, { reverse })`.
They landed in two pull requests before any release, under one bump.

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
- `ports.vcs-commit-ref`, `memory.vcs-versions`, `memory.vcs-worktrees`
  and the two `memory.dry-run-vcs-*` requirements keep the behaviour true; Julian's `vcs` and
  `vcs-safety` contract cases (HAL-3265) hold every adapter to it.
- A snapshot nobody keeps is an unreachable commit; git's own `gc` removes
  it after its usual grace period. A worktree at a snapshot keeps it.
