# Decision: the engine records harness.instructions before harness.started

- Approval: [HAL-3106](/HAL/issues/HAL-3106)
- Kind: internal

The `run-harness` requirement says the engine records `harness.instructions` with the host's pin right before `harness.started`, when the host has instruction files for the agent. Without an instruction source nothing changes.

## Covers

- engine.run-harness
