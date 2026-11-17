# Decision: creating an agent can also write its instructions

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11705 (Liam approved the T6 plan; Sofia's UX check on HAL-1299 asks for the "What should it do?" box in New agent, microcopy 8.2)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/JLlwOrdBm7/uzOAn5+k/4rzH+UPbBsZEjrKDGjhF9O5uqGivO+3F8yulfBpJDZq/Wp4Wt7enLwk10QYpMDUBw==

`NewAgent` gains an optional `instructions`, and `WorkspaceAgents.create` writes it into the new agent's file as a quoted `instructions` line, in the same single undoable change that creates the file. `studio.workspace-agents` therefore grows by one promise: a created agent starts with the instructions it was given, and with none when none were given. Nothing existing is removed or weakened; one example and its test are added.

## Covers

- studio.workspace-agents
