# studio.src-tauri.open-timings

- Status: draft
- Since: unreleased
- Source: HAL-19531

When the agent host has started, the shell shall write one line to `shell.log` naming each step of the start and how many milliseconds it took, and the whole: in Halonic's WSL distro the steps `wsl`, `mounts`, `runtime`, `copy`, `security update`, `start` and `checks`, beside the shell the step `start`. When the start becomes ready, the shell shall write how many milliseconds after the page loaded that was. When a window's `engine_open` answers, the shell shall write how many milliseconds the engine took to answer and, when the page's load was noted, how many milliseconds after it the window asked; when it is refused, as when the engine fails or times out, the shell shall write the same, with the refusal's fixed kind (HAL-19599). A timing line shall hold only step names and whole milliseconds, never a path, a workspace's name or a message.

## Examples

- Given a host in the distro whose `wsl.exe` list took 812 ms and whose start took 4000 ms,
  when the host has started,
  then `shell.log` holds a line with `wsl 812 ms` and `start 4000 ms`, and the whole.
- Given a window that asks for its workspace's engine 12 s after the page loaded,
  when the engine answers 3250 ms later,
  then `shell.log` holds `a window's engine answered in 3250 ms, asked 12000 ms after the page loaded`.
- Given a window whose engine open is refused as `engine_failed` after 60000 ms,
  then `shell.log` holds `a window's engine was refused (engine_failed) after 60000 ms`.
