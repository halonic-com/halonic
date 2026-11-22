# cli.commands.secret.remove

- Status: active
- Since: unreleased
- Source: HAL-195 (9a-2c); phase 4 plan on HAL-9; `app.secret-service`; HAL-15641 (flow check C605, point 6c); HAL-15812 (flow check C631, P1); HAL-15816 (words check C633, point 1)

The `halonic secret remove <name>` command shall remove the secret `<name>` through `SecretService.remove`, print "✓ Removed <name>." and exit 0. When no such secret is saved, it shall print "<name> isn't set, so nothing changed. To see the secrets that are set, run halonic secret list.", change nothing and exit 0, and its `--json` result shall say `"removed": false`. When no such secret is saved but the `HALONIC_SECRET_<NAME>` variable still holds a value, it shall instead print "No secret <name> is saved. Nothing changed." and a second line that names that variable, says that runs still read the secret from it and that unsetting it removes it. It shall refuse a name the service refuses, such as a sign-in token's, with the service's reason and exit 2, and leave the secrets as they were. Without a name, or with more than one, it shall exit 2 with its usage.

## Examples

- Given a saved `openai-key`,
  when `halonic secret remove openai-key` is run,
  then it prints "✓ Removed openai-key." and `halonic secret list` no longer shows it.
- Given no saved `openai-key`,
  when `halonic secret remove openai-key` is run,
  then it prints "openai-key isn't set, so nothing changed. To see the secrets that are set, run halonic secret list." and exits 0.
- Given no saved `openai-key` and `HALONIC_SECRET_OPENAI_KEY` set,
  when `halonic secret remove openai-key` is run,
  then it prints "No secret openai-key is saved. Nothing changed." and "HALONIC_SECRET_OPENAI_KEY is still set, so runs still read openai-key from it. Unset it to remove openai-key." and exits 0.
