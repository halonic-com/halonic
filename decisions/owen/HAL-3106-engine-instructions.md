# Decision: the engine records harness.instructions before harness.started

- Approval: HAL-3106
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wwfy5oJM6FV9OhM/jn/9Sm587Nnphnvtez0FdhoRLZsjM7Dvc1zN0JqgsYBsXIwZTEkO8PDwzCB+6Cni9DrKCg==

The `run-harness` requirement says the engine records `harness.instructions` with the host's pin right before `harness.started`, when the host has instruction files for the agent. Without an instruction source nothing changes.

## Covers

- engine.run-harness
