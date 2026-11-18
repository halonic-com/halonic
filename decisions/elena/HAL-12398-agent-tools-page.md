# Decision: the agents host changes an agent's skills, knowledge and connectors and offers what its hub can use

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11705 (Liam approved the T6 plan, which has the Tools page in Configuration, flow-agents 5.2)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2OzC9ID8NmPZSPoQKZG0Xnkh3MCNw8O0p4Nk1UBNJTV5HbGdzAK5bdvrelz12jdhmaN1oyNCeaCNrSFF7YdpAQ==

`AgentsHost` gains `toolOptions(ref)`, and an agent's settings and changes gain `skills`, `knowledge` and `connectors`. `WorkspaceAgents` writes each list into the agent's file in place, as one undoable change, and offers the hub's own items and the shared ones, only those the hub's `uses` lists when it has one, which is what the workspace check already accepts. To read the shared items it now also lists the workspace's `library` folder. `studio.workspace-agents` therefore grows by one promise. Nothing existing is removed or weakened; examples and tests are added.

## Covers

- studio.workspace-agents
