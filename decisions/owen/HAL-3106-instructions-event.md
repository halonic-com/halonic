# Decision: add the harness.instructions run event to the run-log contract

- Approval: HAL-3106
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PBW2NI+yI1YhqeCPe11Hpo+b4ZyxcFRpln8BeVA22dajGMssPyvvT04M+ydDC8pJI2K0VjW3hPAUCeEUkZpRAA==

The run-log contract gets one more event, `harness.instructions`: the pin (paths and hashes, never contents) of the AGENTS.md and skills a harness run starts with, written right before `harness.started`. Nothing about the existing events changes.

## Covers

- events.run-log-contract
