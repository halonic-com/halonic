# halonic-secrets

The keychain rules the Studio shell shares across platforms (HAL-192, interface agreed with Priya on HAL-229). Plain Rust with no Tauri types and no dependencies; the shell's `secret_get`, `secret_set` and `secret_delete` commands and its desktop and Android backends wrap it.

- `SecretName`: the `Secrets` port's name rule and canonical form (lower case, `-` becomes `_`). The cases in `tests/fixtures/canonical-names.tsv` are the same as the CLI token store's, so both store the same keychain entry under the service `halonic` (`SERVICE`).
- `SecretBackend`: where secrets are kept. `get_secret`, `set_secret` and `delete_secret` check the name and the value first. A backend whose store holds less than 16 KiB says so with `max_value_bytes` (the Windows Credential Manager holds 1,280 bytes). `MemoryBackend` is for tests only.
- `check_backend_contract`: the behaviour every backend must show. CI runs it in memory; the desktop keychain and the Android Keystore run it too.
- `SecretError`: one variant per error `kind`. No message contains a value.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `secret_names_` for `secret-names`.
