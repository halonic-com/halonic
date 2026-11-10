# git.proposal-refs

- Status: active
- Since: 0.1.0
- Source: engine answer point 3 (HAL-3267); plan point 9 of HAL-3245, with Julian's command review (HAL-3358); HAL-3245 git part 5

When a worktree is committed to a proposal ref, the git Vcs shall commit the worktree's files on disk, ignored files and private entries left out, through a temporary index in git's record of the worktree, with the given parent as the only parent and the message `Proposal <ref>`, and create the ref with `update-ref` from an all-zero id, so an existing ref is refused and never overwritten. `readRef` shall read exactly that ref with `show-ref --verify`, never a branch or tag of a similar name, and `deleteRef` shall delete it from the commit it points at, refusing a ref that isn't there.

## Examples

- Given a worktree with a changed file,
  when it is committed to `refs/halonic/proposals/run-1`,
  then no branch contains the commit, and the worktree's record holds no index copy afterwards.
- Given a tag named `refs/halonic/proposals/run-1`,
  when that proposal ref is read,
  then it is `null`, and deleting it is refused.
