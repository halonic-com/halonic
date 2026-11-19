# Decision: the agents host changes an agent's subagents, refuses a loop and gives the hub's team

- Task: HAL-13179
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11705 (Liam approved the T6 plan, which has the Subagents page in Configuration, flow-agents 5.4); Liam reviews PR #3864 on HAL-13179 and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:swWHFHCSMc0LtOs2fFwqpVnxTDDRDOg512JkNQRuRB++FWvFAi2Xk/Z8FzJr+xhj3gSpE27HK7AgnS2GAP0mAw==

## What changes

`studio.workspace-agents` grows by one promise. `WorkspaceAgents` changes an agent's `subagents`
in its file in place, as one undoable change, refuses without writing a new subagent that would
close a loop of hand-offs in the hub (`conflict`, with flow-agents 5.4's sentence), and gives the
hub's agents with the agents each hands work to, sorted by name (`team`). One example is added.
Nothing already in the requirement is removed or weakened.

## Why

The Subagents page (flow-agents 5.4) shows an agent's subagents, lets a person add and remove
them, and must refuse a loop before anything is written. The team chart needs the hub's hand-offs.

## Tests

No test was weakened or skipped. Tests are added for `team`, a subagent written in place, and a
direct and an indirect loop refused without writing.

## Covers

- studio.workspace-agents
