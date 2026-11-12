# cli.commands.sandbox.remove

- Status: draft
- Since: 0.1.0
- Source: HAL-1451; UX checklist on HAL-1444, 1.6

The `halonic sandbox remove` command shall remove the agent sandbox on Windows through `SrtSandbox.remove`, with one administrator prompt. It shall ask first, "Remove the agent sandbox? Agents set to run in a sandbox won't start until you set it up again. Windows asks for administrator rights once. [y/N]", and with `--yes` ask nothing. On No, or Enter, it shall remove nothing, print "Not removed. The sandbox is still set up." and exit 1. When the removal passes it shall print "✓ Removed the agent sandbox" and exit 0. Otherwise it shall print "! The sandbox wasn't removed: Windows didn't give Halonic administrator rights." for a turned-down prompt, or "! The sandbox wasn't removed: *reason*." for any other failure, and exit 1.

## Examples

- Given Windows with the sandbox set up,
  when `halonic sandbox remove` is run and the user answers y,
  then it prints "✓ Removed the agent sandbox" and exits 0.
- Given the administrator prompt is turned down,
  when `halonic sandbox remove --yes` is run,
  then it prints the "wasn't removed" sentence and exits 1.
