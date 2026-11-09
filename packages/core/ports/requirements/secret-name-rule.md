# ports.secret-name-rule

- Status: active
- Since: 0.1.0
- Source: HAL-2234 and HAL-2233; the rule moved from three adapters so every adapter and the workspace checks share it

The ports package shall export the name rule of the `Secrets` port, so every adapter refuses the same names. `isSecretName` shall say whether a name is a letter, then letters, digits, `-` or `_`, at most 128 characters. `secretKey` shall give the form names are matched in (upper case, `-` as `_`) and throw a `RangeError` for a name that breaks the rule. `describeSecretName` shall quote a name only when it is at most 128 printable ASCII characters, and otherwise give only its length, and the `RangeError` shall use it.

## Examples

- Given `serve-password` or `Serve_Password`,
  when `secretKey` is called,
  then it gives `SERVE_PASSWORD`.
- Given `openai key`,
  when `secretKey` is called,
  then it throws a `RangeError` that starts with `Secret name "openai key"`.
- Given a name of 129 characters, or one with a character that isn't printable ASCII,
  when `describeSecretName` is called,
  then it gives `A secret name of N characters` and doesn't repeat the name.
