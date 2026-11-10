# secrets-tauri.refusals

- Status: active
- Since: 0.1.0
- Source: HAL-2611, HAL-192 (`SecretError::kind`), HAL-1211 (the Android Keystore's `unreadable`)

When the shell refuses a call with `unavailable`, `denied`, `unreadable` or `backend`, the Tauri secrets shall reject with a `KeychainError` that keeps that refusal and has the error kind `unavailable`, `denied`, `unauthenticated` or `unavailable`, and shall never answer `null` for it. When the shell refuses a name, it shall reject with a `RangeError`. When the call fails without the shell's refusal shape, it shall reject with a `KeychainError` of refusal `backend` that keeps neither the failure's text nor the failure itself. No error shall hold the value.

## Examples

- Given a stored secret that can no longer be decrypted, so the shell refuses with `unreadable`,
  when it is read,
  then the call rejects with refusal `unreadable` and error kind `unauthenticated`.
- Given a shell whose capability doesn't allow the command,
  when a token is set,
  then the call rejects with refusal `backend` and the message doesn't contain the value.
