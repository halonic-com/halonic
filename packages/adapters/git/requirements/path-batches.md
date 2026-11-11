# git.path-batches

- Status: active
- Since: 0.1.0
- Source: HAL-4438 (Liam's review of halonic#1406, HAL-4431); Windows' 32,767-character command-line limit

The git Vcs shall keep every git call it starts under Windows' command-line limit, however many paths a call names. It shall pass a list of paths as several calls, in order, each with at most 16,384 characters of paths, rather than one call that Windows would refuse. This covers `stage`, `unstage` (before and after the first commit), `discard`, taking private files out of a snapshot, making a version (`commitVersion`: both the copy of the index it commits from and the real index afterwards), making a proposal (`commitWorktreeTo`) and checking out a worktree (`addWorktree`). A list that fits in one call still runs as one call, and an empty list runs none.

## Examples

- Given 500 changed files whose paths come to more than 32,767 characters together,
  when they are staged and then unstaged,
  then every file is staged and then unstaged again, through several `add` and several `reset` calls, each under 32,767 characters.
- Given 500 untracked files with such paths,
  when they are discarded,
  then every file is deleted.
- Given 500 new files with such paths,
  when a first version is made of all of them,
  then the version holds every file and the real index matches it, through several `reset` calls, each under 32,767 characters.
- Given 500 new files with such paths and one more file,
  when a version is made of only that one file, before or after the first commit,
  then the version holds only that file, and the 500 are left out through several calls, each under 32,767 characters.
- Given a commit with 500 private files with such paths,
  when a worktree is checked out from it, and a proposal is made after the files are written into the worktree,
  then neither the worktree nor the proposal holds them, and they are left out through several `rm --cached` calls, each under 32,767 characters.
- Given a single path longer than 16,384 characters,
  when the paths are split,
  then that path is a call of its own.
