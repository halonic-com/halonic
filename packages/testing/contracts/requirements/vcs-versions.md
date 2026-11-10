# contracts.vcs-versions

- Status: draft
- Since: 0.1.0
- Source: HAL-3265; save model (HAL-1102) and its routing note task 1 (HAL-3236); stubs `ports.vcs-commit-ref`, `git.snapshot`, `git.read-at-version`, `git.rename`, `git.worktrees`, `git.diff-between`, `git.apply-patch` and `memory.vcs-v2` in req-adapters-storage (HAL-110); `Vcs` port v2

Where an adapter implements `Vcs` port version 2, `snapshot` shall return the full id of a new commit holding the files on disk, new files included and deleted files left out, and shall leave the status, the index, the branch, the log and the files as they were, also in a repository with no commits yet. `readAt` and `listAt` shall read a commit, never the disk or the index: `listAt` lists every file under a folder recursively, sorted and relative to the workspace, and both give `null` for a file or folder the commit doesn't have; a well-formed id the repository doesn't have shall be refused with `Unknown version`. `rename` shall move a file or a folder; a tracked file shall then be reported as `renamed` and staged, and an untracked one stays untracked; it shall refuse, and change nothing, when the old path is missing or the new one exists. `addWorktree` shall add a worktree with its own id and folder holding a commit's files, and leave the workspace as it was; writes in the worktree and in the workspace shall not reach each other; `listWorktrees` lists the worktrees it added; `removeWorktree` removes one, even with changed files, and an unknown id is refused. `diffBetween` shall list, sorted by path, every file a worktree added, changed or deleted against a commit, with a unified diff each, without changing anything, and those diffs shall apply to the workspace with `applyPatch`. `applyPatch` shall change the working tree only, apply every hunk it is given, reverse a hunk with `{ reverse: true }` and give the file back byte for byte, and refuse a hunk that isn't there. Every new method shall reject on a folder that isn't a repository.

Draft until the port's version 2 lands with the memory Vcs; the git adapter follows (HAL-3245).

## Examples

- Given `a.yaml` committed as "1", staged as "2" and "3" on disk, and a new file `d.yaml`,
  when a snapshot is taken,
  then `readAt(snapshot, "a.yaml")` is "3", `d.yaml` is in `listAt(snapshot)`, and the status, the staged diffs and the log are unchanged.
- Given commit C with `a.yaml` = "2", and `a.yaml` changed on disk to "3" since,
  when `readAt(C, "a.yaml")` is called,
  then it is "2"; `readAt(C, "missing.yaml")` and `listAt(C, "missing")` are `null`.
- Given tracked `agents/old.agent.yaml`,
  when it is renamed to `agents/new.agent.yaml`,
  then the status lists `agents/new.agent.yaml` as `renamed` from the old path, staged.
- Given a worktree at a snapshot where `a.yaml` was changed, `b.yaml` added and `c.yaml` deleted,
  when `diffBetween(snapshot, id)` is called,
  then it lists `a.yaml` modified, `b.yaml` added and `c.yaml` deleted in that order, and applying their diffs to the workspace gives it the worktree's files.
- Given `a.yaml` of ten lines with two changed hunks on disk,
  when the second hunk is applied with `{ reverse: true }`,
  then only the second change is undone and nothing is staged.
