# halonic-keychain

The Studio shell's desktop keychain (HAL-192, plan approved on HAL-1508): the `SecretBackend` from `halonic-secrets` on macOS, Windows and Linux. The shell's `secret_get`, `secret_set` and `secret_delete` commands use it.

- **Where secrets go:** the macOS Keychain, the Windows Credential Manager, or the Secret Service on Linux (GNOME Keyring, KWallet), through the `keyring` crate (3.6.3, pinned, one platform feature per target).
- **The entry:** service `halonic`, user the canonical name (`Acme-Key` becomes `acme_key`), the entry the CLI uses for the same name. On Windows the entry's target is `acme_key.halonic`.
- **No mock store:** keyring 3 keeps secrets in memory when it's built without a platform feature. This crate never uses keyring's default store, and a test checks that each entry is the platform's credential type. On other targets (Android) keyring isn't built, and every call is `unavailable`.
- **Value size:** 16 KiB, except on Windows: the Credential Manager keeps 2,560 bytes of UTF-16, so values there are at most 1,280 bytes. Longer values are `invalid_value`.
- **Errors:** a locked Secret Service or a dismissed unlock prompt is `denied`; a missing keychain on macOS or Windows is `unavailable`; a value that isn't text is deleted and reported as `unreadable`. No message holds a value.

Linux builds need the system's libdbus (`libdbus-1-dev` on Debian and Ubuntu).

## Tests

`cargo test -p halonic-keychain` checks the store and entry each platform picks and the error kinds, without touching a keychain. The contract check against the real keychain is ignored in CI, which has no unlocked keychain. Run it on a desktop:

```sh
cargo test -p halonic-keychain -- --ignored
```

It writes only `halonic_contract_*` entries and deletes them again.

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves (`desktop_keychain_`).
