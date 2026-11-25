# Decision: the keychain keeps one server pairing per workspace, for the agent host only

- Task: HAL-18501
- Approval: Liam reviews this security PR and signs this note as the CTO; Julian gives the security sign-off on its review task
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:04Vzg61h6XHSg2koDIriC51XmC48hMoK4N/S88OcXAeA6qZAq8H1Cj4R58Pd7h9GNHyD4AVxTCMLkTl8CY4uAA==

## What changes

- A new reserved prefix, `server-pairing__`, for the device token the server gives this computer for one workspace (S8a-1 of the plan on HAL-18501, approved by Liam). The entry's name is the prefix and the workspace's key, exactly 32 lower-case hex digits.
- **The agent host reaches it in one exact form only.** The shell's `host-secrets` accepts a name that is the prefix with `-` and 32 lower-case hex digits, as sent, with nothing folded or trimmed (`is_server_pairing_name`). `Server-Pairing__…`, `server_pairing__…`, upper-case hex, a shorter or longer key, or the bare prefix are refused like any other name, and the channel closes. One name per request: no listing, no wildcard. The host's `ShellKeychainSecretStore` checks the same rule (`isServerPairingSecretName` in `@halonicjs/ports`) before it sends anything, and its `names()` never lists a pairing.
- **The page reaches none of them.** `SecretName::is_halonic` counts the canonical prefix `server_pairing__`, so `secret_get`, `secret_has`, `secret_set`, `secret_delete` and the origin commands refuse every spelling with `reserved_name`. `SecretName::token` refuses it too, so `token_get`, `token_set` and `token_delete` never take one, even though their prefixed entry couldn't collide. The canonical form ignores case, as Windows does for credential names, so no spelling reaches the same entry another way.
- **No workspace may pick one.** `isHalonicSecretName` counts every spelling of the prefix, so `workspaceSecrets` and `workspaceSecretWriter` refuse it without asking the store.
- Requirements: `studio.src-tauri.crates.secrets.host-secrets`, `studio.src-tauri.crates.secrets.secret-commands` and `studio.src-tauri.crates.secrets.token-commands` gain the prefix; `agent-host.keychain-secrets` gains the pairings; `secrets-tauri.reserved-names` gains the shared cases; `ports.server-pairing-names` is new (`Since: unreleased`). Nothing any of them refused before is allowed now, apart from the one exact form on the host's channel.

## Why

S8 lets a workspace use the server's messaging engine. The device token must stay on this computer, out of every page answer, and apart for each workspace. A prefix keeps each pairing in its own entry: one entry holding a map of every pairing would need a read-modify-write under a lock, could hit the Windows Credential Manager's 2,560-byte limit, and a failed write could damage every other pairing. One exact form on the host's side, and every spelling refused on the page's side, means the two sides can't meet on the same entry by a case or `-`/`_` trick.

## Tests

No test was skipped or weakened. The shell's `tests/fixtures/server-pairing-names.tsv` holds the shared cases. The shell's `tests/pairing.rs` and `secrets-tauri`'s `reserved-names.test.ts` both read it, so the Rust and TS rules can't drift. Also new: `server-pairing-names.test.ts` in `ports`, the pairing cases in `agent-host`'s `keychain-host-secrets.test.ts`, and the exact-form test of the shell's channel (`host_secrets/tests.rs`).

## Covers

- packages/core/ports/
- apps/studio/src-tauri/crates/secrets/
- apps/agent-host/src/secrets/
- ports.server-pairing-names
- studio.src-tauri.crates.secrets.host-secrets
- studio.src-tauri.crates.secrets.secret-commands
- studio.src-tauri.crates.secrets.token-commands
- agent-host.keychain-secrets
- secrets-tauri.reserved-names
