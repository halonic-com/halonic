# Decision: the sandbox-fence job also runs when the harness bridge changes

- Task: HAL-6342
- Approval: Liam approves this note in review on the review task for HAL-6342
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8xF9qQ4lx/ZNq253/lpIe9R6qrpzMsqcU7P86zcSWkOXsSR1cc7SX3ZP0nv8h2eKMu5PGtHOlBXxOySq5xUaAg==

## What changes

In `.github/workflows/ci.yml`, a change under `packages/adapters/harness-bridge/` now triggers the
`sandbox-fence` job, as a change in `sandbox-srt` already does. The fence tests now start the real
bridge server, so a bridge change can break them.

Triggers for other jobs, rights, runners and secrets don't change.

## Why

The bridge's socket, folder rules and Host, Origin and token checks are now tested through the real
sandbox. Without the trigger, a bridge change could merge without that test running.

## Tests

No test was weakened. Two new test files skip on purpose where the thing they check does not
exist: the W9 socket check (in both files) reads `/proc/net`, which only Linux has. They run
on Linux in the `sandbox-fence` job, on both backends where the backend applies. Nothing that ran
before is skipped.

## Covers

- .github/
- packages/adapters/sandbox-srt/fence/own-sockets.test.ts
- packages/adapters/sandbox-srt/fence/srt-bridge-socket.test.ts
