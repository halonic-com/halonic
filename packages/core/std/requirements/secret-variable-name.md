# std.secret-variable-name

- Status: active
- Since: 0.1.0
- Source: HAL-6266 (a connector may take only non-secret variables from the app's environment; the word test `mcp.stdio-inherited-secrets` already used, moved here so both share it)

The std package shall say, with `isSecretVariableName`, whether an environment variable's name says its value is a secret: whether one of its words, in any letter case, is `TOKEN`, `SECRET`, `KEY`, `APIKEY`, `PASSWORD`, `PASSWD`, `PASSPHRASE`, `CREDENTIAL`, `CREDENTIALS`, `AUTH`, `COOKIE` or `PRIVATE`, with words split at each character that is not a letter or digit and before a capital letter that follows a small letter or digit. A secret word inside a longer word shall not count.

## Examples

- Given `ANTHROPIC_API_KEY`, `NODE_AUTH_TOKEN` or `npm_config__authToken`,
  when it is checked,
  then it is a secret's name.
- Given `KEYMAP`, `AUTHOR` or `AWS_PROFILE`,
  when it is checked,
  then it isn't.
