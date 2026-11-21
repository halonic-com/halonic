# routines.triggers.empty-state

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 15); flow-routines 2.3; HAL-15452

When no routine starts a workflow, its Triggers section shall say "Nothing starts this workflow on its own yet; it runs when called or with Run." On an agent, while Halonic can't run an agent on its own, the section shall say no empty line of its own, since the line of `routines.triggers.agent-cant-run-note` says why nothing starts it.

## Examples

- Given no routine starts a workflow, then the section says the workflow line and still offers Add trigger.
- Given no routine starts the agent Writer, then the section doesn't say "Nothing starts this agent", and says "on its own yet" once.
