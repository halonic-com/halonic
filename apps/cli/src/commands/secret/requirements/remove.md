# cli.commands.secret.remove

- Status: active
- Since: 0.1.0
- Source: HAL-195 (9a-2c); phase 4 plan on HAL-9; `app.secret-service`

The `halonic secret remove <name>` command shall remove the secret `<name>` through `SecretService.remove`, print "✓ Removed <name>." and exit 0, also when no such secret is saved. It shall refuse a name the service refuses, such as a sign-in token's, with the service's reason and exit 2, and leave the secrets as they were. Without a name, or with more than one, it shall exit 2 with its usage.

## Examples

- Given a saved `openai-key`,
  when `halonic secret remove openai-key` is run,
  then it prints "✓ Removed openai-key." and `halonic secret list` no longer shows it.
- Given no saved `openai-key`,
  when `halonic secret remove openai-key` is run,
  then it prints "✓ Removed openai-key." and exits 0.
