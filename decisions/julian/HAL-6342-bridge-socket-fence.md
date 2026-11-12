# Decision: the sandbox-fence job also runs when the harness bridge changes

- Task: HAL-6342
- Approval: Liam approves this note in review on the review task for HAL-6342
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, a change under `packages/harness-bridge/` now triggers the
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
