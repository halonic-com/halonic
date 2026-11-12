# Decision: the sandbox-fence job also runs when the harness bridge changes

- Task: HAL-6342
- Approval: Liam approves this note in review on the review task for HAL-6342
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:T/pwNfSu5j/wVLpHEwZKDPMS+opMN9GcMH3dfaS3RrvLFH9UBL4y6zeQP8jqzAHv3i0R5FZcFOljpt7y/pzHAA==

## What changes

In `.github/workflows/ci.yml`, a change under `packages/adapters/harness-bridge/` now triggers the
`sandbox-fence` job, as a change in `sandbox-srt` already does. The fence tests now start the real
bridge server, so a bridge change can break them.

Triggers for other jobs, rights, runners and secrets don't change.

## Why

The bridge's socket, folder rules and Host, Origin and token checks are now tested through the real
sandbox. Without the trigger, a bridge change could merge without that test running.

## Tests

No test was weakened or skipped.

## Covers

- .github/
