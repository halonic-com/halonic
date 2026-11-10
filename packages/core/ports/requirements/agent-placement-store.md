# ports.agent-placement-store

- Status: active
- Since: 0.1.0
- Source: plan v1.17 (the per-machine "this computer" choice); stack 3a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved with changes by Liam on HAL-1967; Julian's condition on HAL-1709 (a changed agent file cancels the choice)

The ports package shall have an `AgentPlacementStore` port (version 1) that gets, saves and removes an agent's placement by workspace location and agent id. A placement shall hold the key, `runsOn: "this-computer"`, the fingerprint of the agent's file when the person chose, and the time they chose. No record means the agent runs in a sandbox. The port shall only store placements: it shall have no method that decides where an agent runs. Every adapter shall pass the `contracts.agent-placement-store` suite.

The port's documentation shall state that placements live in the user's profile and never in a workspace, that a placement that can't be read makes `get` throw with its key, and that `remove` still deletes it.

The ports package shall export `isAgentPlacementFor(key, value)`, which is true only for a value with exactly the fields of a placement, each text, with `runsOn: "this-computer"` and the given key. Adapters check what they read with it, and `AgentPlacement` checks what a store gives back with it (Julian, HAL-2927).

## Examples

- Given the `AgentPlacementStore` port,
  when its methods are read,
  then they are exactly `get`, `save` and `remove`.
- Given an `AgentPlacementRecord` with `runsOn: "sandbox"`,
  when it is compiled,
  then it doesn't compile: a sandbox is what no record means.
- Given an `AgentPlacementRecord` without `agentFingerprint` or without an agent id,
  when it is compiled,
  then it doesn't compile.
- Given a value with every field of a placement for the key and also `sandbox: false`,
  when `isAgentPlacementFor` checks it,
  then it is false: a placement holds no other field.
- Given a placement for `coder` in `/workspaces/acme`,
  when `isAgentPlacementFor` checks it against `coder` in `/workspaces/other`,
  then it is false.
