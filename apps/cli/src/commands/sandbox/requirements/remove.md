# cli.commands.sandbox.remove

- Status: draft
- Since: 0.1.0
- Source: HAL-1451; UX checklist on HAL-1444, 1.6

The `halonic sandbox remove` command shall remove the agent sandbox on Windows through `SrtSandbox.remove`, with one administrator prompt. It shall ask first, "Remove the agent sandbox? Agents set to run in a sandbox won't start until you set it up again. Windows asks for administrator rights once. [y/N]", and with `--yes` ask nothing. When srt keeps write access to folders outside Halonic's own, or its status can't be read, it shall first write on stderr, right before the question, "Another program on this computer may also use this sandbox (for *folders*), and removing it stops that program's sandbox from working too." (without "(for *folders*)" when it can't name any), where *folders* are the full paths in srt's order, joined with commas and "and", and for more than three the first three and "and *n* more" (Source: HAL-7414 S-7; wording HAL-7440). On No, or Enter, it shall remove nothing, print "Not removed. The sandbox is still set up." and exit 1. When the removal passes it shall print "✓ Removed the agent sandbox" and exit 0. Otherwise it shall print "! The sandbox wasn't removed: Windows didn't give Halonic administrator rights." for a turned-down prompt, or "! The sandbox wasn't removed: *reason*." for any other failure, and exit 1.

## Examples

- Given srt keeps write access to `C:\Tools\notes`, which isn't in Halonic's profile folder, <!-- leak-guard: allow absolute-path made-up example path -->
  when `halonic sandbox remove` is run in a terminal,
  then it prints "Another program on this computer may also use this sandbox (for C:\Tools\notes), …" before the question. <!-- leak-guard: allow absolute-path made-up example path -->

- Given Windows with the sandbox set up,
  when `halonic sandbox remove` is run and the user answers y,
  then it prints "✓ Removed the agent sandbox" and exits 0.
- Given the administrator prompt is turned down,
  when `halonic sandbox remove --yes` is run,
  then it prints the "wasn't removed" sentence and exits 1.
