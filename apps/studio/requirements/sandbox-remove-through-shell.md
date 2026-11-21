# studio.sandbox-remove-through-shell

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812; HAL-15091 (Noah's check C539)

Where Studio runs on Windows with the agent host beside the shell, the Studio app shall remove the sandbox for Settings › Agent sandbox through the shell's `sandbox_elevate` with `remove`, which asks Windows for administrator rights from Studio's own window, and not through the agent host's hidden PowerShell. It shall first call the host's `POST /v1/sandbox/remove/before` and start the shell's helper only when the host answers `{ ok: true }`: while runs use the sandbox it shall end as in use, and when the host's half failed as a failure with the host's reason, both without asking Windows. It shall send only the helper's exit code to the host's `POST /v1/sandbox/remove/elevated` and take the host's answer. A turned-down prompt shall end as cancelled; the shell's time limit shall end as a removal that didn't finish, and an earlier helper still running as a removal still running, both without asking the host how it ended; a helper the shell couldn't start, or couldn't wait for, shall end as a failure that reads "Windows couldn't start Halonic's sandbox helper.", with Windows' message and code kept only for **Copy details**. Elsewhere, and when the shell doesn't say the host runs beside it, the host shall run the removal as before.

## Examples

- Given no run uses the sandbox and the shell's helper exited with 0,
  when the section removes the sandbox,
  then the removal worked.
- Given one run uses the sandbox,
  when the section removes the sandbox,
  then it ended as in use and Windows wasn't asked.
- Given the helper still ran after the shell's 5 minutes,
  when the section removes the sandbox,
  then it ended as a removal that didn't finish, and the host wasn't asked how it ended.
