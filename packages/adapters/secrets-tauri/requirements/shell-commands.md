# secrets-tauri.shell-commands

- Status: active
- Since: 0.1.0
- Source: HAL-2611, HAL-192 (the shell's `secret_*` commands), HAL-229 (interface agreed with Elena), HAL-2903 (malformed replies)

The Tauri secrets shall implement `Secrets` and `TokenStore` by calling the shell's `secret_get`, `secret_set` and `secret_delete` commands with the name as given, and shall check the name against the `Secrets` name rule before it sends anything. It shall add no value rule of its own: a value the shell refuses (`invalid_value`) shall reject with a `RangeError`, and an answer to `secret_get` that is neither non-empty text nor `null`, or an answer to `secret_set` or `secret_delete` that is not `null`, shall reject with a `KeychainError` of refusal `backend`. The shell never stores an empty value, and its set and delete return nothing, so any other answer is malformed and is not taken for a value or for success.

## Examples

- Given `Google-Refresh` is set,
  when `GOOGLE-REFRESH` is removed,
  then the shell receives `secret_delete` with the name `GOOGLE-REFRESH` and nothing is stored.
- Given the name `serve.password`,
  when any method is called,
  then it rejects with a `RangeError` and the shell receives no call.
- Given the Windows Credential Manager, which holds 1,280 bytes,
  when 1,281 bytes are set,
  then it rejects with a `RangeError` and nothing is stored.
- Given a shell that answers `secret_set` with `{ stored: false }`,
  when a token is set,
  then it rejects with a `KeychainError` of refusal `backend`.
- Given a shell that answers `secret_get` with `""`,
  when a token is read,
  then it rejects with a `KeychainError` of refusal `backend`, not `""`.
