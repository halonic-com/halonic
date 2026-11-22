# cli.commands.secret.remove

- Status: active
- Since: unreleased
- Source: HAL-195 (9a-2c); phase 4 plan on HAL-9; `app.secret-service`; HAL-15641 (flow check C605, point 6c)

The `halonic secret remove <name>` command shall remove the secret `<name>` through `SecretService.remove`, print "✓ Removed <name>." and exit 0. When no such secret is saved, it shall print "<name> wasn't set. Nothing changed.", change nothing and exit 0, and its `--json` result shall say `"removed": false`. It shall refuse a name the service refuses, such as a sign-in token's, with the service's reason and exit 2, and leave the secrets as they were. Without a name, or with more than one, it shall exit 2 with its usage.

## Examples

- Given a saved `openai-key`,
  when `halonic secret remove openai-key` is run,
  then it prints "✓ Removed openai-key." and `halonic secret list` no longer shows it.
- Given no saved `openai-key`,
  when `halonic secret remove openai-key` is run,
  then it prints "openai-key wasn't set. Nothing changed." and exits 0.
