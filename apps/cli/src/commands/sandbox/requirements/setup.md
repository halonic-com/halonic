# cli.commands.sandbox.setup

- Status: draft
- Since: 0.1.0
- Source: HAL-1451; UX checklist on HAL-1444, 1.3, 1.4 and 1.10; HAL-1415 (risk 6)

The `halonic sandbox setup` command shall set the agent sandbox up on Windows through the same `SrtSandbox.setUp` that Studio and the installer run, with one administrator prompt. It shall ask first, "Set up the agent sandbox? Windows asks for administrator rights once. [y/N]", and with `--yes` ask nothing. On No, or Enter, it shall set nothing up, print "Not set up. Nothing changed." and exit 1. With no terminal, or `CI` set, and no `--yes`, it shall start nothing and exit 2. When the setup passes it shall print "✓ Set up the agent sandbox" and "✓ Checked the agent sandbox" and exit 0. Otherwise it shall print the outcome's sentence from microcopy 13.1 with a ! (cancelled, failed with its reason, or set up but not passing its check), with the helper's code after the reason when there is one, and exit 1. With `--json` the document's `outcome` shall be `ready`, `cancelled`, `failed` or `check_failed`, with `reason` and `code` when there are any. On other systems it shall ask nothing, change nothing, say only Windows needs the setup and exit 0.

## Examples

- Given Windows where the setup passes,
  when `halonic sandbox setup` is run and the user answers y,
  then it prints both ✓ lines and exits 0.
- Given no terminal,
  when `halonic sandbox setup` is run without `--yes`,
  then nothing is started and it exits 2.
- Given the helper fails with code 12,
  when `halonic sandbox setup --yes` is run,
  then it prints "! The sandbox isn't set up: Windows didn't accept the sandbox's network rules." with "Code 12" after it, and exits 1.
