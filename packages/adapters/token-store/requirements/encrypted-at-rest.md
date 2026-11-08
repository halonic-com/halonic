# token-store.encrypted-at-rest

- Status: active
- Since: 0.1.0
- Source: HAL-620

The token store shall store each token only AES-256-GCM-encrypted, with a new random nonce each time and bound to its canonical name, and shall throw an `UnreadableTokenError` that names the token but never its value when a stored value won't open.

## Examples

- Given a token that was set,
  when the whole change log is serialized,
  then it contains the token neither as text nor as base64 or base64url.
- Given a sealed value copied to another token name, changed, missing, or in an unknown format,
  when that token is read,
  then the store throws an `UnreadableTokenError` and never returns `null`.
- Given a value sealed with another key,
  when it is read,
  then the error says it was sealed with a different token key.
