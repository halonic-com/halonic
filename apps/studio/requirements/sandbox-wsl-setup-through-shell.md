# studio.sandbox-wsl-setup-through-shell

- Status: draft
- Since: unreleased
- Source: HAL-16765 (scope, PR 2), HAL-16771; the failure lines HAL-16780

Where Studio runs on Windows with the agent host in Halonic's WSL distro, and the shell says so through `sandbox_wsl_setup_offered`, the Studio app shall set the sandbox up for Settings › Agent sandbox through the shell's `sandbox_wsl_setup`, called with no argument, and not through the agent host, which can't start without its distro. A setup that is done, or that needs Windows to restart, shall leave no outcome, so the check that follows says Ready or Restart needed; until Studio starts again after a restart, the check shall say Restart needed while the host can't start. A turned-down prompt shall end as cancelled, the shell's time limit as a setup that didn't finish, and an earlier setup still running as a setup still running. A failure shall read the sandbox-start catalogue's reason for its code, except that a distro called `halonic` that Halonic didn't import, a WSL kernel too old or unreadable, and a missing image each read their own line; a host the shell couldn't start reads "Windows couldn't start Halonic's sandbox helper.", and a setup that ended without saying how reads that the host stopped before it said, both with what the shell said kept only for **Copy details**. An answer of any other shape shall be refused. Where the shell doesn't offer it, the setup shall run as before.

## Examples

- Given the shell answers that the setup is done,
  when the section sets the sandbox up,
  then it leaves no outcome and the shell was asked with no argument.
- Given the shell answers that Windows must restart,
  when the section sets the sandbox up and checks while the host can't start,
  then the check says Restart needed.
- Given the setup failed with the reason `other` and the code `distro-not-ours`,
  when the section sets the sandbox up,
  then the failure reads the line for a distro Halonic didn't import, not "Halonic can't tell what the sandbox is missing."
- Given the setup failed with the reason `virtualisation-off`,
  when the section sets the sandbox up,
  then the failure reads the catalogue's reason for `virtualisation-off`.
- Given the shell says the WSL setup isn't offered, or can't say,
  when Studio starts,
  then the shell's WSL setup isn't used.
