# studio.sandbox-remove-through-shell

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812

Where Studio runs on Windows with the agent host beside the shell, the Studio app shall remove the sandbox for Settings › Agent sandbox through the shell's `sandbox_elevate` with `remove`, which asks Windows for administrator rights from Studio's own window, and not through the agent host's hidden PowerShell. It shall first call the host's `POST /v1/sandbox/remove/before` and start the shell's helper only when the host answers `{ ok: true }`: while runs use the sandbox it shall end as in use, and when the host's half failed as a failure with the host's reason, both without asking Windows. It shall send only the helper's exit code to the host's `POST /v1/sandbox/remove/elevated` and take the host's answer. A turned-down prompt shall end as cancelled; the shell's time limit, an earlier helper still running and Windows' reason a helper didn't start shall each end as a failure that says so, without asking the host how it ended. Elsewhere, and when the shell doesn't say the host runs beside it, the host shall run the removal as before.

## Examples

- Given no run uses the sandbox and the shell's helper exited with 0,
  when the section removes the sandbox,
  then the removal worked.
- Given one run uses the sandbox,
  when the section removes the sandbox,
  then it ended as in use and Windows wasn't asked.
- Given the helper still ran after the shell's 5 minutes,
  when the section removes the sandbox,
  then it ended as a failure that says Windows didn't finish removing it within 5 minutes.
