# ports.server-pairing-names

- Status: draft
- Since: unreleased
- Source: HAL-18501 (S8a-1, plan approved by Liam), HAL-17512 `server-engine` rev 2

The ports package shall export `isServerPairingSecretName`, which is true only for `server-pairing__` followed by exactly 32 lower-case hex digits, with nothing folded or trimmed, and `serverPairingSecretName`, which builds that name from a workspace's key and throws a `RangeError` for any other key. `isHalonicSecretName` shall be true for every name whose `secretKey` form starts with `SERVER_PAIRING__`, whatever its case or `-` and `_` spelling, so `workspaceSecrets` and `workspaceSecretWriter` refuse it without asking the store.

## Examples

- Given `server-pairing__0123456789abcdef0123456789abcdef`,
  when `isServerPairingSecretName` checks it,
  then it is true.
- Given `Server-Pairing__0123456789abcdef0123456789abcdef`, `server_pairing__0123456789abcdef0123456789abcdef` or the same name with upper-case hex,
  when `isServerPairingSecretName` checks it,
  then it is false, and `isHalonicSecretName` is true.
- Given `SERVER-PAIRING__x`,
  when a workspace view's `get` is called,
  then it throws `RangeError("A workspace can't pick a secret that belongs to Halonic.")` and the store is not asked.
- Given the key `0123456789ABCDEF0123456789ABCDEF`,
  when `serverPairingSecretName` builds a name,
  then it throws a `RangeError`.

## What it doesn't cover

Which caller may reach the keychain entry: the shell's requirements `host-secrets` (the agent host, in the exact form only) and `secret-commands` and `token-commands` (the page, never). The same cases for both sides are in the shell's `tests/fixtures/server-pairing-names.tsv`, which `secrets-tauri.reserved-names` reads.
