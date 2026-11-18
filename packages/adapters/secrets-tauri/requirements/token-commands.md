# secrets-tauri.token-commands

- Status: active
- Since: unreleased
- Source: HAL-11253; `apps/studio/src-tauri/crates/secrets/requirements/token-commands.md`

The Tauri tokens shall implement `TokenStore` by calling the shell's `token_get`, `token_set` and `token_delete` commands with the token's own name, and shall check the name against the `Secrets` name rule, and against the longest name that still fits once the shell adds the token prefix, before they send anything. Their refusals and malformed answers shall be handled as `secrets-tauri.shell-commands` and `secrets-tauri.refusals` say for the secrets.

## Examples

- Given the token `Google-Refresh` is set,
  when it is read as `google_refresh` and removed as `GOOGLE-REFRESH`,
  then the shell receives `token_set`, `token_get` and `token_delete` with those names, and nothing is stored.
- Given a token and a secret both named `acme_key`,
  when the token is set,
  then the secret still reads `null`.
- Given a name one character longer than fits once prefixed,
  when a token is set,
  then it rejects with a `RangeError` that doesn't repeat the name, and the shell receives no call.
