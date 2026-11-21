# studio.src-tauri.sandbox-elevate-command

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812; replaces HAL-1415's "no time limit" for Studio only

When the page calls `sandbox_elevate` with `setup` or `remove`, the shell shall start the `halonic-sandbox-elevate.exe` beside the app with Windows' administrator prompt, owned by the calling window, with that verb as its one argument, wait at most five minutes, and answer `{ outcome: "exited", exitCode }`, `{ outcome: "cancelled" }`, `{ outcome: "timed_out" }`, `{ outcome: "still_running" }` or `{ outcome: "failed", reason }`. It shall refuse any other verb, and take no path, argument or folder from the page. It shall be granted to the app's own local main window on Windows only, never to the Studio the computer serves, and on other systems it shall refuse the call.

## Examples

- Given the page calls `sandbox_elevate` with `install`,
  then the shell refuses it and starts nothing.
- Given the helper exits with 13,
  when the page calls `sandbox_elevate` with `setup`,
  then the answer is `{ outcome: "exited", exitCode: 13 }`.
- Given the Studio the computer serves,
  when it calls `sandbox_elevate`,
  then the shell refuses it as not allowed.
