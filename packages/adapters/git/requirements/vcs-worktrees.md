# git.vcs-worktrees

- Status: active
- Since: 0.1.0
- Source: HAL-3245 (`Vcs` port v2, git part 4 to come); the memory Vcs's `memory.vcs-worktrees`

While git part 4 of HAL-3245 hasn't landed, the git Vcs shall refuse `addWorktree`, `removeWorktree`, `listWorktrees`, `diffBetween` and `applyPatch` with an error that names the method, and change nothing in the folder or the repository.

## Examples

- Given a repository with `a.yaml` committed,
  when `addWorktree` is called with its HEAD,
  then it is refused with "The git Vcs can't addWorktree yet", and the status and the log are the same as before.
