# git.worktrees

- Status: active
- Since: 0.1.0
- Source: save model 7.1–7.3 (HAL-1102); routing note tasks 1 and 4 (HAL-3236); HAL-3245 git part 4

When a worktree is added at a version, the git Vcs shall check that commit out, detached, into a new folder named by the worktree's id inside the worktrees folder it was given, leaving out every private entry the commit has, and return its id, folder and version. It shall refuse to add one when it was given no worktrees folder, or when that folder is inside the workspace folder or holds it. `listWorktrees` shall list, oldest first, only the worktrees it added whose folder is still there, and `removeWorktree` shall delete a worktree's folder, whatever is in it, and git's record of it, also when the folder is already gone.

## Examples

- Given a commit that tracks `.env`,
  when a worktree is added at it,
  then the worktree's folder holds the other files and no `.env`, its HEAD is that commit, detached, and the workspace's status is unchanged.
- Given a worktrees folder inside the workspace folder,
  when a worktree is added,
  then it is refused and no worktree is added.
- Given a worktree whose folder was deleted,
  when it is removed,
  then git's record of it is gone too, and removing it again fails with `Unknown worktree <id>`.
