# git.apply-patch

- Status: active
- Since: 0.1.0
- Source: save model 3.2 and 3.3 (HAL-1102); routing note task 1 (HAL-3236); HAL-3245 git part 4

When a patch is applied, the git Vcs shall apply it, or undo it with `reverse`, to the workspace's working tree with `git apply`, never to the index, with its lines as written whatever `apply.whitespace` the repository sets. Before git applies it, it shall check every path both as the patch's headers write it and as `git apply --numstat` reads it, and refuse with a `RangeError` a patch with a NUL, a quoted path, a `diff --git` line naming two paths, or a header that does more than change a plain file's lines. When any part doesn't apply cleanly, it shall refuse the whole patch with `The change no longer matches the file.` and change nothing.

## Examples

- Given a repository whose config sets `apply.whitespace=fix`,
  when a patch adds a line ending in spaces,
  then the line is written with its spaces.
- Given a patch that changes `a//b.yaml`, which git reads as `a/b.yaml`,
  when it is applied,
  then it is refused with a `RangeError` and nothing changes.
- Given a patch whose `index` line gives the mode `120000` or `160000`,
  when it is applied,
  then it is refused with a `RangeError`.
