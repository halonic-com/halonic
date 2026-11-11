# harness-kit.proposal-worktree-git

- Status: active
- Since: 0.1.0
- Source: HAL-3188 (Julian's case for `app.run-proposal-worktree`); HAL-4790

While an agent works in a proposal folder that is a git worktree, its sandbox profile shall leave the worktree's `.git` file, the worktree's record in the main repository (its gitdir) and the main repository's hooks outside every folder the program may write, and shall name the `.git` file read-only. The profile builder shall refuse a working folder that a link in the worktree leads into the main repository's `.git` folder.

## Examples

- Given a run's worktree of the workspace in Halonic's data folder,
  when the agent's profile is built,
  then no writable folder is, holds or is inside the worktree's `.git` file, its gitdir, or `.git/hooks/post-checkout` in the worktree or the main repository.
- Given a link `files` in the worktree to the main repository's `.git/hooks`, or to the worktree's gitdir,
  when the agent's profile is built,
  then it is refused.
