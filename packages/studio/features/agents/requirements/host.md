# agents.host

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 1, PR 4a), HAL-13179 (subagents, agent steps); flow-agents 5.4; req-agents

When another feature asks the open workspace for its agents, the agents feature shall offer them through `AgentsHostService` (`agents.host`) as a list, one row by hub and id, a sync name for tabs, the workflows that run an agent (`referencesTo`) a way to create an agent whose id comes from its name, a way to read and change its name, description, instructions and subagents (`settings`, `update`), its agent steps in the file's order and a way to add one whose id comes from its name (`addAgentStep`), and the agents of its hub with the agents each hands work to (`team`); when an agent isn't there it shall reject with a `not_found` answer, and when an agent is created or changed it shall tell its listeners, and it shall refuse an empty name, or an agent step without a name or instructions, with `invalid_input` and a new subagent that would close a loop with `conflict`, its message saying who already hands work to whom, "Sorter already hands work to Mail triage; that would be a loop." (flow-agents 5.4), with "through *Writer*" when the work goes through others.

## Examples

- Given the host has the agent `refund-checker` in the hub `acme`, then `list` gives its row and `nameOf` gives its name at once.
- Given a task step of the workflow `reply` runs `refund-checker`, then `referencesTo` gives that workflow with its name.
- Given no workflow runs the agent, then `referencesTo` gives an empty list.
- Given the host has no agent `ghost`, then `read` and `referencesTo` reject with `not_found`.
- Given the hub already has `refund-checker`, when a person creates an agent called "Refund checker", then its id is `refund-checker-2` and the listeners are told.
- Given an agent, when its instructions change, then `settings` gives the new text and the listeners are told.
- Given a change with an empty name, then `update` rejects with `invalid_input` and nothing changes.
- Given Sorter hands work to Mail triage, when Mail triage's subagents change to Sorter, then `update` rejects with `conflict` and the message "Sorter already hands work to Mail triage; that would be a loop.", and nothing changes.
- Given Sorter hands work to Writer and Writer to Mail triage, then adding Sorter to Mail triage is refused with "Sorter already hands work to Mail triage through Writer; that would be a loop."
- Given the hub has Writer, Mail triage and Sorter, then `team` gives all three sorted by name, each with its subagents.
- Given the agent has the agent step `check-refund`, when a person adds an agent step called "Check refund", then its id is `check-refund-2` and `settings` lists both in that order; one without instructions is refused with `invalid_input`.
