# studio.src-tauri.crates.secrets.token-commands

- Status: draft
- Since: unreleased
- Source: HAL-11253

When the page calls `token_get`, `token_set` or `token_delete` with a token's name, the shell shall check the name against the secret name rule, keep the token under `halonic_token_` followed by the name's canonical form (at most 128 characters in all), and check the value for `token_set` as `secret_set` does, before the backend runs. It shall return the token or nothing for `token_get`, replace any stored token for `token_set`, and succeed for `token_delete` even when nothing is stored. If a call fails, then the shell shall return one of the kinds of `secret-commands`, with a message that never contains the value.

## Examples

- Given the page stores the token `Google-Refresh-Acme`,
  when `token_get` reads `google_refresh_acme`,
  then it returns the token, which is kept as `halonic_token_google_refresh_acme`.
- Given a secret and a token both named `acme_key`,
  when either is read,
  then each command returns its own value.
- Given a token name of 115 characters,
  when the page stores it,
  then the result is `invalid_name` and nothing is written; 114 characters fit.
- Given a token that isn't stored,
  when `token_delete` runs,
  then it succeeds.
