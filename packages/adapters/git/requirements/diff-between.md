# git.diff-between

- Status: active
- Since: 0.1.0
- Source: save model 7.2 (HAL-1102); routing note tasks 1 and 4 (HAL-3236); HAL-3245 git part 4

When the changes between a version and a worktree are asked for, the git Vcs shall return every public file that differs between that commit and the worktree's files on disk, new files included, each with its path, its state (`added`, `modified` or `deleted`, never a rename) and a unified diff with `a/` and `b/` prefixes and unquoted paths beyond ASCII, sorted by path. It shall work on a copy of the worktree's index in git's record of it, so the worktree, its index and the workspace don't change, and leave no copy behind.

## Examples

- Given a worktree where `café.yaml` changed,
  when `diffBetween` is called,
  then `café.yaml` is listed as `modified`, and its diff applies to the workspace with `applyPatch`.
- Given a worktree where `.env` was written,
  when `diffBetween` is called,
  then `.env` isn't listed.
