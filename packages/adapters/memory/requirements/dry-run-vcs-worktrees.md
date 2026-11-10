# memory.dry-run-vcs-worktrees

- Status: active
- Since: 0.1.0
- Source: HAL-3245; routing note task 1 (HAL-3236); HAL-1662

The dry-run Vcs shall read `listWorktrees` and `diffBetween` through to the repository it wraps, and shall record `addWorktree`, `removeWorktree` and `applyPatch` instead of making them. It shall refuse, and record nothing for, a version that isn't a full commit id or that the repository doesn't have, and a patch it can't read or that names a path the port refuses. A recorded worktree's id and folder shall start with `dry-run:`.

## Examples

- Given a dry run, when a worktree is added at S and a patch is applied, then `changes()` reports both in order, and the repository has no new worktree and no changed file.
