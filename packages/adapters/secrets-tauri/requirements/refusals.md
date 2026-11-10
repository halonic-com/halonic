# secrets-tauri.refusals

- Status: active
- Since: 0.1.0
- Source: HAL-2611, HAL-192 (`SecretError::kind`), HAL-1211 (the Android Keystore's `unreadable`), HAL-2903 (refusals that hold the value)

When the shell refuses a call with `unavailable`, `denied`, `unreadable` or `backend`, the Tauri secrets shall reject with a `KeychainError` that keeps that refusal and has the error kind `unavailable`, `denied`, `unauthenticated` or `unavailable`, and shall never answer `null` for it. When the shell refuses a name, it shall reject with a `RangeError`. Only a plain object (what Tauri's IPC parses a refusal into) counts as the shell's refusal shape. When the call fails without that shape, even an `Error` that carries a `kind`, it shall reject with a `KeychainError` of refusal `backend` that keeps neither the failure's text nor the failure itself. When a refusal of `secret_set` has a message that holds the value, it shall keep the refusal's kind and drop the message. No error shall hold the value.

## Examples

- Given a stored secret that can no longer be decrypted, so the shell refuses with `unreadable`,
  when it is read,
  then the call rejects with refusal `unreadable` and error kind `unauthenticated`.
- Given a shell whose capability doesn't allow the command,
  when a token is set,
  then the call rejects with refusal `backend` and the message doesn't contain the value.
- Given a shell that refuses `secret_set` with `backend` and a message that repeats the value,
  when a token is set,
  then the call rejects with refusal `backend` and the message doesn't contain the value.
