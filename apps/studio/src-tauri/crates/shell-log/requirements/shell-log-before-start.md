# studio.src-tauri.crates.shell-log.shell-log-before-start

- Status: draft
- Since: unreleased
- Source: HAL-19260 (security review of #6271: quick ask's and the feedback shortcut's keys are registered in a plugin's `setup`, which runs before the app's `setup` starts the log)

When the shell records a line before its log has started, it shall write it to stderr and hold it, and when the log starts, it shall write the held lines to the log first, oldest first, before any line recorded after. It shall hold at most 100 lines; of the lines past that, it shall write only a note saying how many were left out. A line recorded after the log started shall never be held.

## Examples

- Given quick ask's saved keys that can't be read when Halonic starts,
  when the plugin records it before the app starts the log,
  then `studio/shell.log` holds the line `quick-ask: the saved keys can't be read: …` once the log starts.
- Given 103 lines recorded before the log starts,
  when it starts,
  then the log holds the first 100 and the note `shell log: 3 more lines recorded before the log started were left out`.
