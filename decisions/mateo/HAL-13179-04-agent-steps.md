# Decision: the agents host reads an agent's agent steps and adds one in place

- Task: HAL-13179
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11705 (Liam approved the T6 plan, which has the Agent steps page in Configuration, flow-agents 7); Liam reviews PR #3882 on HAL-13179 and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:J6l+iOAWDxZPBFcqcOP9GR/J23FJTcOSLqarmoghBlvL0GjYVr6s+eeK0lGq3rXcHkluxgYeniEvOA5G/f1eCQ==

## What changes

`studio.workspace-agents` grows by one promise. `WorkspaceAgents` reads an agent's agent steps
(`methods`) in the file's order with their description, instructions, model and model call limit,
and adds one in place as one undoable change, with the id taken from its name (`-2` when the agent
has it), refusing an empty name or instructions without writing. One example is added. Nothing
already in the requirement is removed or weakened.

## Why

The Agent steps page (flow-agents 7) lists an agent's agent steps and offers **New agent step**.

## Tests

No test was weakened or skipped. Tests are added for reading the steps, adding one in place with
the file's comments kept, the `-2` id, and empty instructions refused without writing.

## Covers

- studio.workspace-agents
