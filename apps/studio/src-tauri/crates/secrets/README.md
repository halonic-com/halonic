# halonic-secrets

The keychain rules the Studio shell shares across platforms (HAL-192, interface agreed with Priya on HAL-229). Plain Rust with no Tauri types and no dependencies; the shell's `secret_get`, `secret_has`, `secret_set`, `secret_delete`, `secret_allowed_origins` and `secret_allow_origin` commands, its `token_get`, `token_set` and `token_delete` commands, and its desktop and Android backends wrap it.

- `SecretName`: the `Secrets` port's name rule and canonical form (lower case, `-` becomes `_`). The cases in `tests/fixtures/canonical-names.tsv` are the same as the CLI token store's, so both store the same keychain entry under the service `halonic` (`SERVICE`).
- `SecretBackend`: where secrets are kept. `get_secret`, `has_secret`, `set_secret` and `delete_secret` check the name and the value first, and refuse Halonic's own names (`reserved_name`): `token-key`, `serve-password` and every name under `halonic_token_`. The check is in the shell, so a page that calls the commands directly can't reach them either.
- Tokens: `get_token`, `set_token` and `delete_token` keep a token under `halonic_token_` and its canonical name (`SecretName::token`), the entry the page's token store already used. They are the only way to a token. A backend whose store holds less than 16 KiB says so with `max_value_bytes` (the Windows Credential Manager holds 1,280 bytes). `MemoryBackend` is for tests only.
- Allowed origins: `allowed_origins` and `allow_origin` keep the origins a key may be sent to, at most `MAX_ALLOWED_ORIGINS` (8), beside the key and apart from its value (requirement `key-origins`, HAL-11887). A new value keeps them; `delete_secret` removes them before the value. The shell makes each origin from an address; this crate only stores it.
- `check_backend_contract`: the behaviour every backend must show. CI runs it in memory; the desktop keychain and the Android Keystore run it too.
- `SecretError`: one variant per error `kind`. No message contains a value.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `secret_names_` for `secret-names`.
