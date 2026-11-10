# memory.dry-run-vcs-remove-worktree

- Status: active
- Since: 0.1.0
- Source: HAL-4049; Liam's review of #957 (HAL-4114)

When asked to remove a worktree, the dry-run Vcs shall refuse, and record nothing, if the folder isn't a repository while no `init` is recorded, or if the id is neither a worktree of the repository it wraps nor one the dry run recorded and hasn't recorded as removed.

## Examples

- Given a dry run that recorded a worktree and its removal,
  when the caller removes that worktree again, then the removal is refused and `changes()` still holds one removal.
- Given a folder that isn't a repository,
  when the caller removes a worktree through a dry run, then it is refused and nothing is recorded.
