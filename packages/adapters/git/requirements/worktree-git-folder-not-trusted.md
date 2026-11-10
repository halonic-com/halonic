# git.worktree-git-folder-not-trusted

- Status: active
- Since: 0.1.0
- Source: routing note task 4 (HAL-3236); HAL-3188; HAL-3245 git part 4

While it runs git in a worktree, the git Vcs shall name git's record of the worktree in the workspace's repository and the worktree's folder explicitly, never through the `.git` file in the worktree's folder, which whatever ran there could have rewritten. It shall know a worktree only when that record points back at the worktree's folder, and shall run no git in it when the record names another repository, holds a link or has a `config.worktree`; removing such a worktree runs no git and still works.

## Examples

- Given a worktree whose `.git` file was rewritten to point at a planted repository whose config sets `core.fsmonitor`,
  when `diffBetween` runs on it,
  then the planted program doesn't run and the diff is taken in the workspace's repository.
- Given a worktree whose record's `commondir` was changed,
  when `diffBetween` runs on it,
  then it is refused, and `removeWorktree` still removes it.
