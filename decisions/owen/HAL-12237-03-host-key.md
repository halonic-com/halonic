# Decision: the remote host's key is a secret no workspace may read, and the risky switch becomes live

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14072 (Liam, CTO; the B2 plan for HAL-12237)
- Kind: internal

Tunnel phase B, build plan decisions 10 and 12 (HAL-12232). Two active requirements change, both to add, nothing is loosened:

**`ports.workspace-secrets`.** The agent host keeps its static X25519 key, the one phones pin, through the secrets port as `remote-host-key`. That store is also where a workspace's provider keys are read, so without this a provider file could name `remote-host-key` as its key and the host would send the private key to the provider. The name joins Halonic's own names that `workspaceSecrets` refuses. It goes in a new list, `hostSecretNames`, not `halonicSecretNames`, because the Cloudflare target reads that list as the secrets every deployment needs. The test gains two names; none is removed.

**`agent-host.remote-gateway`.** "A phone shall not answer a risky approval, because nothing on the host allows it yet" becomes "unless the person's risky switch is on", with the switch off unless the host is given one and read again for every answer. No launch gives one yet, so every launch behaves as before; the host's `RemoteControl` (a later B2 pull request) passes the person's setting, which is off by default.

## Covers

- ports.workspace-secrets
- agent-host.remote-gateway
