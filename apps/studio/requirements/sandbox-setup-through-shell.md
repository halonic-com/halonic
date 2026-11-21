# studio.sandbox-setup-through-shell

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812

Where Studio runs on Windows with the agent host beside the shell, the Studio app shall set the sandbox up for Settings › Agent sandbox and the Inbox setup card through the shell's `sandbox_elevate` with `setup`, which asks Windows for administrator rights from Studio's own window, and not through the agent host's hidden PowerShell. It shall send only the helper's exit code to the host's `POST /v1/sandbox/setup/elevated` and take the host's answer, so the setup is done only when the host's unelevated check passes. A turned-down prompt shall end as cancelled; the shell's time limit shall end as a setup that didn't finish, and an earlier helper still running as a setup still running, both without asking the host; Windows' reason a helper didn't start shall end as a failure that says so. Elsewhere, and when the shell doesn't say the host runs beside it, the host shall run the setup as before.

## Examples

- Given the shell's helper exited with 0 and the host's check passes,
  when the section sets the sandbox up,
  then the setup worked.
- Given the person turned Windows' prompt down,
  when the section sets the sandbox up,
  then it ended as cancelled and the host wasn't asked.
- Given the helper still ran after the shell's 5 minutes,
  when the section sets the sandbox up,
  then it ended as a setup that didn't finish.
- Given the host runs in Halonic's WSL distro,
  when Studio starts,
  then the shell's start isn't used.
- Given the helper of an earlier press still runs,
  when the section sets the sandbox up again,
  then it ended as a setup still running and Windows wasn't asked again.
