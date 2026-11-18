# Decision: the agents host changes an agent's harness, checks the turn limit and answers whether a harness can run

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11705 (Liam approved the T6 plan, which has the Harness page in Configuration)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AS56RcsxyO5YvGffCDJJ1udjDjrKGJvJpZsDwkrnd7+Efw9ESBWGs3Ff1YXIuWkl4xuFCWmV/7+RdMKFBkNNAw==

`AgentsHost` gains `harnessReadiness(ref, harness)`, and an agent's settings and changes gain `harness`. `WorkspaceAgents` writes the harness into the agent's file in place, as one undoable change, and refuses a turn limit that is not a whole number from 1 to 200 before writing (Liam's note on #3461). The readiness comes from an optional `detectHarness` part; without it the answer is "failed". `studio.workspace-agents` therefore grows by two promises. Nothing existing is removed or weakened; examples and tests are added.

## Covers

- studio.workspace-agents
