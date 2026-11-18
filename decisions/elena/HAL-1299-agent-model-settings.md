# Decision: the agents host reads model aliases and saves an agent's model and turn limit

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11705 (Liam approved the T6 plan, which has the Model page in Configuration)
- Kind: internal

`AgentsHost` gains `modelAliases(ref)`, and an agent's settings and changes gain `model` and `maxSteps` (the turn limit). `WorkspaceAgents` reads the aliases from `models.yaml` and the agent's hub, and writes the model and turn limit into the agent's file in place, as one undoable change, like the other fields. `studio.workspace-agents` therefore grows by one promise. Nothing existing is removed or weakened; one example and its test are added.

## Covers

- studio.workspace-agents
