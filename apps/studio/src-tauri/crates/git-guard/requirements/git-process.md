# studio.src-tauri.crates.git-guard.git-process

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-1930

When the shell runs git, it shall run the program found on an absolute PATH folder, without a shell, in a process group of its own. If git runs past its deadline or writes more than its output limit to stdout or to stderr, then the shell shall stop git with every program it started and report `timed_out` or `output_too_large`, never cut-off output. If a program git started keeps git's output open after git exits, then the call shall still end by the deadline, with `timed_out`.

## Examples

- Given git waiting on input that never comes,
  when the deadline passes,
  then git is stopped and the result is `timed_out`.
- Given git that started a program which holds the output open,
  when the deadline passes,
  then git and that program are stopped, and the call ends.
- Given git that exited and left a program running that holds the output open,
  when the deadline passes,
  then the call ends with `timed_out` instead of waiting for that program.
- Given git writing more than the output limit,
  when the shell runs it,
  then git is stopped and the result is `output_too_large`.
