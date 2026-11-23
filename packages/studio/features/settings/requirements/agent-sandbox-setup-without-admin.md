# settings.agent-sandbox-setup-without-admin

- Status: draft
- Since: unreleased
- Source: HAL-16765, HAL-16771; wording decided by the team (Noah, HAL-16780, under HAL-2282)

When the sandbox needs setting up and the check says its setup asks for no administrator rights (`withoutAdmin`, Halonic's WSL distro is missing), Settings › Agent sandbox shall show no line under **Set up the sandbox**, in place of "Windows asks for administrator rights once.", and while the setup runs shall show "Setting up the agent sandbox…" without "Windows is asking for administrator rights. Check the taskbar if you don't see the request.", since no prompt appears. The chip, the line under it and the button stay the same.

## Examples

- Given a check that needs setup with `withoutAdmin`,
  when the section shows it,
  then the chip reads "Needs setting up", the button "Set up the sandbox", and no line shows under it.
- Given a check that needs setup with `withoutAdmin`,
  when the setup starts,
  then the step reads "Setting up the agent sandbox…" with no note about Windows' prompt.
- Given a check that needs setup without `withoutAdmin`,
  when the section shows it and the setup starts,
  then the line under the button is "Windows asks for administrator rights once." and the step's note says Windows is asking for administrator rights.
