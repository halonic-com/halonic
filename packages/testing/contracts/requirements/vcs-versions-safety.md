# contracts.vcs-versions-safety

- Status: draft
- Since: 0.1.0
- Source: HAL-3265; routing note task 1 (HAL-3236); stubs `ports.vcs-commit-ref`, `git.worktrees` and `git.apply-patch` in req-adapters-storage (HAL-110); HAL-6 finding 7; `Vcs` port v2

Where an adapter implements `Vcs` port version 2, it shall add every worktree outside the workspace folder, and no worktree shall show in the workspace's files or status. It shall leave private entries (`.env`, `.env.*`, `.envrc`, `.studio`) out of every snapshot and out of a worktree's changes, even when written into the worktree's folder, and refuse with a `RangeError` to read or list one at a version. It shall refuse with a `RangeError`, before anything runs and changing nothing, every version that isn't a full commit id in lowercase hex (such as `HEAD`, `main`, `@{-1}`, `-x`, a short id or an id with a suffix), in `readAt`, `listAt`, `addWorktree` and `diffBetween`; and refuse a worktree id it didn't give, such as `..` or a worktree's folder. It shall refuse with a `RangeError` every path the port refuses, in `readAt`, `listAt` and both sides of `rename`, and rename a file named like an option or a pattern as that file only. It shall apply a patch whole or not at all: when any part doesn't apply cleanly, every file and the index stay byte for byte as they were. It shall refuse with a `RangeError`, and change nothing, a patch that names a path the port refuses, as the file it changes or the file it renames or copies to, and refuse a patch that creates a symbolic link.

Draft until the port's version 2 lands with the memory Vcs; the git adapter follows (HAL-3245).

## Examples

- Given a repository,
  when two worktrees are added,
  then neither folder is the workspace folder or inside it.
- Given `.env` in the workspace folder,
  when a snapshot is taken,
  then `listAt(snapshot)` doesn't list it and `readAt(snapshot, ".env")` rejects with a `RangeError`.
- Given a worktree with `.env` written into its folder and `a.yaml` changed,
  when `diffBetween` is called,
  then it lists only `a.yaml`.
- Given a repository,
  when `readAt("HEAD", "a.yaml")`, `addWorktree("@{-1}")` or `listAt("-x")` is called,
  then it rejects with a `RangeError` and no worktree is added.
- Given a staged change to `b.yaml` and a further change on disk,
  when a patch whose first file applies and whose second no longer matches is applied,
  then it rejects, and every file and every staged diff are unchanged.
- Given a repository,
  when a patch that changes `.git/config`, renames `a.yaml` to `.git/config`, or changes `../x.yaml` is applied,
  then it rejects with a `RangeError` and nothing changes.
- Given a repository,
  when a patch that creates `link` as a symbolic link to `.git` is applied,
  then it rejects and no `link` appears.
