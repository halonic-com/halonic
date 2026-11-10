# contracts.vcs-commits-hardened

- Status: draft
- Since: 0.1.0
- Source: HAL-3317; plan points 8 and 9 of HAL-3245; HAL-9 plan section 11; HAL-3188 (a worktree's `.git` file); `Vcs` port v2

Where a `Vcs` adapter drives git, it shall run `commitVersion`, `commitWorktreeTo`, `readRef` and `deleteRef` so that no hook (among them `pre-commit`, `post-commit`, `post-index-change` and `reference-transaction`), signing program or filter planted in the repository's config or attributes runs, and `commitWorktreeTo` shall take the worktree's repository from the workspace repository's own record, never from the `.git` file in the worktree's folder. An adapter that runs no git declares so and the cases are skipped, as for `contracts.vcs-hardened`.

Draft until the first adapter that drives git passes it (HAL-3245 PR 5).

## Examples

- Given a repository with every hook and the local config programs of `contracts.vcs-hardened` planted, `commit.gpgSign` on among them,
  when a version is created with an exclusion, a worktree is committed onto a proposal ref, and the ref is read and deleted,
  then no planted program has run.
- Given a worktree whose `.git` file was rewritten to point at a planted repository,
  when `commitWorktreeTo` runs on it,
  then the planted program doesn't run and the proposal holds the worktree's files, in the workspace repository.
