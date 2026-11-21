# Decision: a plugin secret hand-over still in flight when the host stops keeps nothing

- Approval: HAL-14464, from Liam's security review of the plugin secrets hand-over on HAL-13692; Liam approves this note in his security review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:brOWDn2WgK1Ccvch6+hGga65yitxLjBTWiLW2Ga/VgVGF1e2Kf5MLtHdA+5S/G1lg2jVadYUEY6VxhHylQh2Cw==
- Task: HAL-14464

## What changes

`agent-host.plugin-secrets`: when the agent host stops while a hand-over is still checking the
plugin's trust, the hand-over now answers 503 `host_stopping` and keeps nothing. Before, it could
write the values back after the stop had dropped them, so they stayed in memory until the process
ended. The requirement gets that sentence and an example; nothing else in it changes.

Tests: one new test in `plugin-secret-routes.test.ts` stops the host while the trust check runs.
No test was removed or changed.

## Why

Liam asked for it as a non-blocking point in the security review on HAL-13692: the agent host
drops every value when it stops, and no hand-over should be able to undo that.

## Covers

- agent-host.plugin-secrets
