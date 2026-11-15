# Decision: add the harness.instructions run event to the run-log contract

- Approval: [HAL-3106](/HAL/issues/HAL-3106)
- Kind: internal

The run-log contract gets one more event, `harness.instructions`: the pin (paths and hashes, never contents) of the AGENTS.md and skills a harness run starts with, written right before `harness.started`. Nothing about the existing events changes.

## Covers

- events.run-log-contract
