# contracts.vcs

- Status: active
- Since: 0.1.0
- Source: HAL-181; plan 4.3 and phase 3; `Vcs` port v1

Every `Vcs` adapter shall report whether its folder is a repository, its branch, upstream, commits ahead and behind, and every changed file as modified, added, deleted, renamed or untracked, staged or not. It shall diff, stage, unstage and discard exactly the files it is given, and discard shall put a tracked file back to the index and delete an untracked one. It shall commit only what is staged, refuse to commit when nothing is staged, and list commits newest first, at most `limit` of them. It shall create, list and switch branches, pull only by fast-forward, push without force, and make the first remote the upstream of a branch that has none. When `limit` isn't a whole number of at least 1, `log` shall reject with a `RangeError`.

## Examples

- Given a repository where `a.yaml` changed, `b.yaml` was deleted and `c.yaml` is new,
  when the three are staged,
  then the status lists them as modified, deleted and added, each staged.
- Given a staged change to `a.yaml` and a later unstaged one,
  when `a.yaml` is discarded,
  then it holds the staged content and stays staged.
- Given two clones where both committed after the last push,
  when the second pulls or pushes,
  then it rejects, and its branch and files stay as they were.
- Given a clone on a new branch `feature`,
  when it pushes,
  then its upstream is `origin/feature`.
