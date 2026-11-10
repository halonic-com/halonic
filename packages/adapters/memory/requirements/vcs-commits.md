# memory.vcs-commits

- Status: active
- Since: 0.1.0
- Source: HAL-3354; plan points 8 and 9 on HAL-3245; engine answer points 2 and 3 (HAL-3267); `Vcs` port v2

The memory Vcs shall make Create version (`commitVersion`) a commit on the current branch of HEAD's files with every change in its working tree under `include` (everywhere without it) and not under `exclude`, where a path names a file or every file in a folder, and a path left out keeps HEAD's content. It shall set the index to the new commit's content for the paths in scope only, and leave the working tree as it was. It shall never commit a change to a private entry or to a file under `.halonic/review/`, keep one HEAD tracks as HEAD has it, refuse an empty `include` and any path the port refuses with a `RangeError`, and refuse, changing nothing, an empty message or a commit with no change. `commitWorktreeTo` shall commit a worktree's public files with the given parent as the only parent and keep the proposal ref apart from the branches; it shall refuse a ref that exists, and `deleteRef` a ref that doesn't.

## Examples

- Given tracked `a.yaml` and `b.yaml` both changed on disk,
  when Create version excludes `b.yaml`,
  then the new commit holds the new `a.yaml` and the old `b.yaml`, and the status lists only `b.yaml`.
- Given a worktree at S with `a.yaml` changed,
  when it is committed to `refs/halonic/proposals/run-1` on S,
  then `readRef` gives the commit, its only parent is S, and `branches()` is unchanged.
- Given `refs/halonic/proposals/run-1` exists, when a second proposal is committed to it, then it is refused and the ref still names the first.
