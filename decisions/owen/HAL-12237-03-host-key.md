# Decision: the remote host's key is a secret no workspace may read, and the risky switch becomes live

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14072 (Liam, CTO; the B2 plan for HAL-12237)
- Kind: internal

Tunnel phase B, build plan decisions 10 and 12 (HAL-12232). Two active requirements change, both to add, nothing is loosened, and two draft ones of the native shell with them:

**`ports.workspace-secrets`.** The agent host keeps its static X25519 key, the one phones pin, through the secrets port as `remote-host-key`. That store is also where a workspace's provider keys are read, so without this a provider file could name `remote-host-key` as its key and the host would send the private key to the provider. The name joins Halonic's own names that `workspaceSecrets` refuses. It goes in a new list, `hostSecretNames`, not `halonicSecretNames`, because the Cloudflare target reads that list as the secrets every deployment needs. The test gains two names; none is removed.

**`agent-host.remote-gateway`.** "A phone shall not answer a risky approval, because nothing on the host allows it yet" becomes "unless the person's risky switch is on", with the switch off unless the host is given one and read again for every answer. No launch gives one yet, so every launch behaves as before; the host's `RemoteControl` (a later B2 pull request) passes the person's setting, which is off by default.

**Studio's native secret commands** (draft requirements `studio.src-tauri.crates.secrets.secret-commands` and `studio.src-tauri.served-page`). After the security review (HAL-14084, High): the shell keeps its own list of names the `secret_*` commands refuse (`HALONIC_NAMES`), and `remote_host_key` joins it, so the connect page can't read, replace, delete or send out the host key once it is kept in the keychain. Both requirements name it and their tests gain it; nothing is removed. A new shared fixture, `crates/secrets/tests/fixtures/reserved-names.txt`, is what the shell's list and the ports' lists are each checked against, so the two can't drift again (new requirement `secrets-tauri.reserved-names`).

## Covers

- ports.workspace-secrets
- agent-host.remote-gateway
- studio.src-tauri.crates.secrets.secret-commands
- studio.src-tauri.served-page
