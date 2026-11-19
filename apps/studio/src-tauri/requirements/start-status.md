# studio.src-tauri.start-status

- Status: draft
- Since: unreleased
- Source: HAL-13408, HAL-8005; design HAL-7986 (`first-run-progress`, section 3.2)

When the page loads, the shell shall forget what it saw of the last start and start a timer. When the page calls `engine_ready`, the shell shall note that the page's engine is ready and start the agent host unless one runs. When the page calls `start_status`, the shell shall answer `{ state, phase, cause, exitCode, seconds }`: `state` is `starting`, `still_starting` from 30 s after the page loaded, `ready` once the engine is ready and the host has started, or `failed`; `phase` is the last of `page_loaded`, `engine_ready`, `wsl_ready` (the host in Halonic's WSL distro only) and `host_started` reached; `cause` is set only for `failed`. A start that fails shall be `failed` at once, with the cause `missing` (the host's program isn't there), `blocked` (the system refused to run it), `stopped` (it ended before its handshake, with its exit code, or none when a signal stopped it), `broken` (its first line isn't a handshake), `timed_out`, `wsl_missing`, `distro_missing`, `wsl_failed` (with `wsl.exe`'s exit code) or `other`. With no answer 60 s after the page loaded, the start shall be `failed` with `timed_out`; a host that starts later still makes it `ready`. A call to `engine_ready` after a failure is a new try: the shell shall forget the failure and start the timer again. The answer shall hold only these fixed values and numbers, never the host's error output, a message, a path or a name. Both commands shall be granted to the app's own local main window on desktop only, never to the Studio the computer serves.

## Examples

- Given a host that starts,
  when the page calls `engine_ready` and then `start_status`,
  then the state is `ready` and the phase `host_started`.
- Given a host that prints a path to its error output and exits with code 3 before its handshake,
  when the page calls `engine_ready` and then `start_status`,
  then the state is `failed`, the cause `stopped` and `exitCode` 3, and the answer holds nothing of what it printed.
- Given the page loaded 30 s ago and the host hasn't answered yet,
  when the page calls `start_status`,
  then the state is `still_starting`; 60 s after the load it is `failed` with `timed_out`.
- Given a failed start,
  when the page calls `engine_ready` again,
  then the timer starts again and the shell tries to start the host once more.
