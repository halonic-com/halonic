# routines.triggers.empty-state

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 15); flow-routines 2.3; HAL-15456 (C580 row 3)

When no routine starts the owner, the Triggers section shall say "Nothing starts this workflow on its own yet; it runs when called or with Run." for a workflow and "No trigger starts this agent." for an agent.

## Examples

- Given no routine starts a workflow, then the section says the workflow line and still offers Add trigger.
