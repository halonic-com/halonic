# studio.src-tauri.crates.secret-broker.engine-secret-broker

- Status: draft
- Since: unreleased
- Source: HAL-14218; decision D4 of the B1 design note (HAL-14206) with the security review's changes (HAL-14212)

When the background engine asks the shell for a workspace secret, a token or a key's allowed origins, the shell shall check the name before any keychain call, refuse with `reserved_name` a workspace secret or origins name that belongs to Halonic (`token_key`, `serve_password`, any name under `halonic_token_`, by the same rule as `secret-commands`) or to a plugin (any name under `plugin__`, in canonical form), read a token only under `halonic_token_` as `token-commands` does, and answer only reads. While the engine's workspace has no trust record on this computer, or the record can't be read, the shell shall refuse every request with `untrusted`. The shell shall make one keychain call at a time, and if a call doesn't return within 30 seconds, then it shall answer `unavailable`; while 16 requests of the engine are open, counting calls still in the keychain, it shall refuse the next with `busy`. The shell shall record a refusal in its log by the request's kind and the reason, never with the name or a value, and its answer's debug form shall never hold a value.

## Examples

- Given a trusted workspace and a stored key `acme_key`,
  when the engine asks for the secret `acme_key`,
  then the shell answers its value.
- Given the names `token_key`, `Serve-Password`, `halonic_token_google` and `Plugin--acme--key`,
  when the engine asks for any of them as a secret or for its origins,
  then the shell refuses with `reserved_name` and the keychain isn't read.
- Given the token `google_refresh_acme`,
  when the engine asks for it as a token,
  then the shell answers the value stored as `halonic_token_google_refresh_acme`.
- Given a workspace whose trust was revoked after the engine started,
  when the engine asks for a secret,
  then the shell refuses with `untrusted`.
- Given a keychain that waits on an unlock prompt,
  when the engine asks for a secret,
  then the shell answers `unavailable` after the time limit, and a second request doesn't reach the keychain until the first call returns.
