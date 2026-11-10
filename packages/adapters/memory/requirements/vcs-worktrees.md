# memory.vcs-worktrees

- Status: active
- Since: 0.1.0
- Source: HAL-3245; routing note task 1 (HAL-3236); `Vcs` port v2

The memory Vcs shall add a worktree at a commit as a store of its own holding that commit's files, with an id `worktree-<n>` and the folder name `memory:worktrees/<id>`, and give its files through `worktreeFiles(id)`; `diffBetween` shall list every file that differs between a commit and a worktree as `added`, `modified` or `deleted` with a unified diff, sorted by path. A worktree shall never hold a private entry, such as `.env`, even when the commit tracks one, and `diffBetween` and `status` shall leave private entries out, so a diff applied to the workspace can never change or delete one. `applyPatch` shall read a unified diff in git's format, applying (or with `reverse`, undoing) each hunk only where its lines, context included, match the working tree exactly, at the line its header names or moved by lines added or removed above it, and shall refuse the whole patch, changing nothing, when any hunk doesn't match, a file to create exists, a file to delete keeps lines, or a path is one the port refuses. It shall refuse with a `RangeError`, changing nothing, a patch it can't read or that does more than edit, create or delete a plain text file's lines: a binary change, a rename or a copy, a mode change, a symbolic link, a gitlink, a new executable file, or a `diff --git` line whose file the lines don't change.

## Examples

- Given snapshot S and a worktree at S where `a.yaml` was changed, `b.yaml` added and `c.yaml` deleted,
  when `diffBetween(S, id)` is called,
  then it lists `a.yaml modified`, `b.yaml added` and `c.yaml deleted`, and the workspace is unchanged.
- Given `a.yaml` with two changed hunks,
  when the patch of the second hunk is applied with `{ reverse: true }`,
  then only the second hunk is undone.
- Given a patch whose hunk's lines have since been edited, when it is applied, then it is refused and no file changes, not even another file in the same patch.
- Given a commit that tracks `.env` and a worktree at it where `.env` was rewritten and `a.yaml` changed,
  when `diffBetween` is called,
  then it lists only `a.yaml`, the worktree lists no `.env`, and `status` shows no change.
