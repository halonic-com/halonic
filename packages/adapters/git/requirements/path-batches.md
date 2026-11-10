# git.path-batches

- Status: active
- Since: 0.1.0
- Source: HAL-4438 (Liam's review of halonic#1406, HAL-4431); Windows' 32,767-character command-line limit

The git Vcs shall keep every git call it starts under Windows' command-line limit, however many paths a call names. It shall pass a list of paths as several calls, in order, each with at most 16,384 characters of paths, rather than one call that Windows would refuse. This covers `stage`, `unstage` (before and after the first commit), `discard`, and taking private files out of a snapshot. A list that fits in one call still runs as one call, and an empty list runs none.

## Examples

- Given 500 changed files whose paths come to more than 32,767 characters together,
  when they are staged and then unstaged,
  then every file is staged and then unstaged again, through several `add` and several `reset` calls, each under 32,767 characters.
- Given 500 untracked files with such paths,
  when they are discarded,
  then every file is deleted.
- Given a single path longer than 16,384 characters,
  when the paths are split,
  then that path is a call of its own.
