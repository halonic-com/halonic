# Decision: the Tauri secrets are no longer a token store

- Task: HAL-11253
- Approval: Liam suggested both clean-ups in his review of the token commands pull request (#3541, HAL-12326, 18 Nov), and signs this note during review.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:eJjZP6vmi5D785+/qbJXeiCZWA/WwCKw5PKsUMrIdgU3NwwadFbcp61s62pFsUbYyaEJPgQWg/YMZZEqAySjCQ==

## What changes

- `secrets-tauri.shell-commands`: `TauriSecrets` implements `Secrets` (with `SecretStore`'s `set` and `remove`, and `has`), no longer `TokenStore`. Since the token commands landed, the shell refuses every name under the token prefix to the secret commands, so a token kept through `TauriSecrets` would sit outside the token namespace, where nothing reads it. Tokens go through `TauriTokens`. No caller used `TauriSecrets` or `shellKeychain` as a `TokenStore`; `shellKeychain` now returns `Secrets & Pick<SecretStore, "set" | "remove"> & SecretPresence`, so the plugin settings and model keys that write through it are unchanged.
- `contracts.token-store`: the shared `TokenStore` contract no longer runs over `TauriSecrets`, since it isn't one. The contract still runs over every other token store, and `TauriTokens` keeps its own tests.
- `@halonicjs/studio-services` drops `maxShellTokenNameLength`, an alias of the adapter's `maxTokenNameLength` that nothing outside its own test used. The test now uses `maxTokenNameLength`.

## Why

A `Secrets` that also claims to be a `TokenStore` invites code to keep a token where the token commands can't find it. Removing the claim leaves one way to a token, which is what the token commands were for. Users see no change.

## Covers

- secrets-tauri.shell-commands
- contracts.token-store
