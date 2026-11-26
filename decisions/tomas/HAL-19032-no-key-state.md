# Decision: a connection this computer holds no key for is `no-key`, not `signed-out`

- Approval: plan approved by Liam on HAL-19033; wording approved by Sofia on HAL-19034 (decided by the team, HAL-2282); Liam signs this note in his review of the pull request on HAL-19032
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:UBjfQqnh5sQcZgQiw8SJaTxm6DFz1zWt2ZgFAuuWC8hC4C3K/tw33RRhvn4I1rLMqoELDlyNrhNsZclaC4dgCg==
- Task: HAL-19032

## What changes

The agent host listed a connection as `signed-out` both when it held no key for it on this
computer (after a restart before Studio restores the key, in a clone, after Disconnect) and when
Paperclip refused the key. Studio said "key expired or revoked" for both, which was wrong in the
first case: the key was still valid (HAL-19027).

A connection row now has a fourth state, `no-key`, for the first case. `signed-out` means only
that Paperclip refused the key. The state exists only on connection rows
(`ConnectionRowState` in `@halonicjs/adapter-agent-host-client`); `MessagingSourceState` in
`core/ports` doesn't change, so Inbox and Messenger don't either. Studio restores a key for a
`no-key` row as it did for a `signed-out` one. The row says "Not connected · no key on this
computer" with Sign in.

## Requirements edited

- `agent-host.paperclip-connection`: one sentence and one example for `no-key`.
- `agent-host.paperclip-key`: the Disconnect example now says the connection shows no key on this
  computer, which is what its row says after the key is forgotten.
- `connections.connection-row`: the `no-key` row's wording and one example.
- `services.paperclip-restore`: restore reads the keychain for `no-key` rows as well as
  `signed-out` ones.

No test is removed or weakened: the one expectation that changed from `signed-out` to `no-key`
(Disconnect in two workspaces) now checks the more exact state.

## Covers

- agent-host.paperclip-connection
- agent-host.paperclip-key
- connections.connection-row
- services.paperclip-restore
