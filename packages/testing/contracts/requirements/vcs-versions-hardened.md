# contracts.vcs-versions-hardened

- Status: draft
- Since: 0.1.0
- Source: HAL-3265; HAL-9 plan section 11; HAL-3188 (a worktree's `.git` file); stub `git.worktree-git-folder-not-trusted` in req-adapters-storage (HAL-110); `Vcs` port v2

Where a `Vcs` adapter drives git, it shall run `snapshot`, `readAt`, `listAt`, `rename`, `addWorktree`, `listWorktrees`, `diffBetween`, `applyPatch` and `removeWorktree` so that no hook and no program planted in the repository's config or attributes runs, and it shall take a worktree's repository from the workspace repository's own record, never from the `.git` file in the worktree's folder, so a `.git` file rewritten to point at a planted repository runs nothing and changes no result. An adapter that runs no git declares so and the cases are skipped, as for `contracts.vcs-hardened`.

Draft until the first adapter that drives git passes it (HAL-3245, after HAL-2607).

## Examples

- Given a repository with every hook and the local config programs of `contracts.vcs-hardened` planted,
  when a snapshot is taken, read and listed, a worktree is added at it (which checks files out), changed, diffed and removed, and a patch is applied and reversed,
  then no planted program has run.
- Given a worktree whose `.git` file was rewritten to point at a planted repository whose config sets `core.fsmonitor`,
  when `diffBetween` runs on it,
  then the planted program doesn't run and the changes are still those of the worktree against the workspace repository.
