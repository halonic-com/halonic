# harness-kit.real-path

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (link resolution comes in from outside the host layer)

The harness kit shall resolve a path a harness program names as the operating system does, for the ask policy: an existing path to its real path, and `linked` when it is a file with more than one name; a path that isn't there yet to its nearest existing parent's real path plus the rest. On Linux and macOS it shall follow links before `..`, never fold `..` by name; on Windows, which folds `..` by name before it follows links, it shall do the same as Windows. It shall give nothing for a dangling link, for `.` or `..` in the part that isn't there on Linux and macOS, and for any error other than the path not being there.

## Examples

- Given `worktree/keys` is a link to `~/.ssh`,
  when `worktree/keys/new-key` is resolved,
  then it is `~/.ssh/new-key`.
- Given the same link, on Linux or macOS,
  when `worktree/keys/../config` is resolved,
  then it is `~/config`, not `worktree/config`.
- Given the same link, on Windows,
  when `worktree\keys\..\config` is resolved,
  then it is `worktree\config`, where Windows would write it.
- Given `worktree/dangling` is a link to a file that isn't there,
  when it is resolved,
  then the answer is nothing.
- Given `worktree/src/config` is a hard link to `~/.ssh/config`,
  when it is resolved,
  then it is linked.
