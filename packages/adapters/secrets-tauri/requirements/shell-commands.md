# secrets-tauri.shell-commands

- Status: active
- Since: 0.1.0
- Source: HAL-2611, HAL-192 (the shell's `secret_*` commands), HAL-229 (interface agreed with Elena)

The Tauri secrets shall implement `Secrets` and `TokenStore` by calling the shell's `secret_get`, `secret_set` and `secret_delete` commands with the name as given, and shall check the name against the `Secrets` name rule before it sends anything. It shall add no value rule of its own: a value the shell refuses (`invalid_value`) shall reject with a `RangeError`, and an answer to `secret_get` that is neither text nor `null` shall reject with a `KeychainError` of refusal `backend`.

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
