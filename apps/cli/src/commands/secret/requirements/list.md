# cli.commands.secret.list

- Status: active
- Since: 0.1.0
- Source: HAL-195 (9a-2c); phase 4 plan on HAL-9 (`list` shows names only); `app.secret-service`

The `halonic secret list` command shall print the names of the saved secrets through `SecretService.list`, one per line in name order, and never a value, with exit 0. With `--json` it shall add `secrets`, the names. With no saved secrets it shall print "No secrets are saved." It shall leave out the sign-in tokens, and shall list the sign-in password by its name only, never its hash.

## Examples

- Given saved `openai-key` and `anthropic-key`,
  when `halonic secret list` is run,
  then it prints `anthropic-key` and `openai-key`, and neither value.
- Given no saved secrets,
  when `halonic secret list` is run,
  then it prints "No secrets are saved." and exits 0.
