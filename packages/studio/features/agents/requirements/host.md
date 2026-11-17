# agents.host

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 1); flow-agents; req-agents

When another feature asks the open workspace for its agents, the agents feature shall offer them through `AgentsHostService` (`agents.host`) as a list, one row by hub and id, a sync name for tabs, the workflows that run an agent (`referencesTo`) and a way to create an agent whose id comes from its name; when an agent isn't there it shall reject with a `not_found` answer, and when an agent is created it shall tell its listeners.

## Examples

- Given the host has the agent `refund-checker` in the hub `acme`, then `list` gives its row and `nameOf` gives its name at once.
- Given a task step of the workflow `reply` runs `refund-checker`, then `referencesTo` gives that workflow with its name.
- Given no workflow runs the agent, then `referencesTo` gives an empty list.
- Given the host has no agent `ghost`, then `read` and `referencesTo` reject with `not_found`.
- Given the hub already has `refund-checker`, when a person creates an agent called "Refund checker", then its id is `refund-checker-2` and the listeners are told.
