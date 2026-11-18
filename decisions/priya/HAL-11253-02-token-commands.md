# Decision: tokens get their own shell commands, and the secret commands refuse Halonic's names

- Task: HAL-11253
- Approval: Liam approved this change on HAL-11253 (comment of 18 Nov): the token commands ship in the same pull request as the refusal, with a decision note for him to sign.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ToFtTkECP4Xb35f10rLZ/ZlmILSYXqKnjVpRDziGptsH8yF7HU9xEYeBKQupRdLCZ2jBww0ay0tMP/fSj866Dw==

## What changes

- `studio.src-tauri.crates.secrets.secret-commands`: `secret_get`, `secret_has`, `secret_set` and `secret_delete` refuse `token-key`, `serve-password` and every name under `halonic_token_`, in canonical form, with the new kind `reserved_name`, before the keychain is asked. Two examples are added.
- `studio.src-tauri.crates.secrets.token-commands` (new): `token_get`, `token_set` and `token_delete` keep a token under `halonic_token_` and its canonical name, the entry the page's token store already used, so stored tokens are found as before.
- `studio.src-tauri.served-page`: the connect page may also call the three token commands, and an example shows `secret_get` refused as `reserved_name` over IPC.
- `secrets-tauri.refusals`: `reserved_name` rejects with a `RangeError`, like `invalid_name`.
- `secrets-tauri.token-commands` (new): `TauriTokens` implements `TokenStore` over the token commands.
- `services.shell-secrets`: the `TokenStore` sends tokens to the token commands instead of prefixing names itself. `Secrets` still refuses Halonic's names on the page too.
- Tests: the shared `Secrets` and `TokenStore` contracts for `TauriSecrets`, and the shared-names test, run over a fake shell with the new refusal off, because their names include `serve-password` and `token-key`; the refusal has tests of its own in Rust, over IPC and in the adapter. `TauriTokens` isn't run through the `TokenStore` contract, whose longest name doesn't fit once prefixed (as for the page's token store before); its own tests cover the other cases. No other test was weakened or skipped.

## Why

The rule that a page can't read a token or Halonic's own secrets as a secret lived only in page-side TypeScript, so code in the page that called the commands directly could reach them. The shell now refuses those names itself, and the token commands are the only way to a token. Users see no change.

## Covers

- studio.src-tauri.crates.secrets.secret-commands
- studio.src-tauri.served-page
- secrets-tauri.refusals
- services.shell-secrets
