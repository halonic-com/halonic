# cli.commands.trust.remove-nothing

- Status: active
- Since: unreleased
- Source: HAL-15205, from flow check C548 (item 5) on HAL-15156

When the workspace has no trust on this computer, because it was never trusted or its trust was already removed, the `halonic trust [--dir <folder>] --remove` command shall print "✓ Acme isn't trusted on this computer, so there was no trust to remove." instead of "Removed trust for Acme.", change nothing and exit 0. Its `--json` shall give the `status` `not-trusted` instead of `removed`.

## Examples

- Given Acme, never trusted on this computer,
  when `halonic trust --dir acme --remove` runs,
  then it prints "✓ Acme isn't trusted on this computer, so there was no trust to remove." and exits with 0.
- Given Acme, trusted and then removed with `halonic trust --dir acme --remove`,
  when `halonic trust --dir acme --remove --json` runs again,
  then it exits with 0 and its `status` is `not-trusted`.
