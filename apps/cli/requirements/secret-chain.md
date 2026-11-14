# cli.secret-chain

- Status: active
- Since: 0.1.0
- Source: HAL-195 (9a-2c); phase 4 plan on HAL-9; `env-secrets.first-secret`

The `halonic` command shall read the secrets its commands use from the environment first, `HALONIC_SECRET_<NAME>`, and then from the secrets file in the profile that `halonic secret set` writes. It shall open the file only for a name the environment doesn't have, so a command whose secrets are all in the environment never touches it and a missing file is no secret. A damaged or readable-by-others file, or a profile folder that can't be found, shall stop only the command that needs a secret from it, with the file store's own error.

## Examples

- Given `HALONIC_SECRET_OPENAI=from-env` and a saved `openai`,
  when a command reads `openai`,
  then it gets `from-env`.
- Given a saved `anthropic` and nothing in the environment,
  when a command reads `anthropic`,
  then it gets the saved value.
- Given no secrets file,
  when a command reads `google`,
  then it gets nothing.
- Given the environment has `openai` and the profile folder can't be found,
  when a command reads `openai`,
  then it gets the environment's value and the file is never opened.
