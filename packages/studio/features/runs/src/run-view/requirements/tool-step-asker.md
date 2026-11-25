# runs.run-view.tool-step-asker

- Status: active
- Since: unreleased
- Source: HAL-18635 (the `tool` step kind, `engine.tool-state`; its approvals carry `step: "tool"`, `events.tool-step-marker`); the wording is decided in the review on HAL-18635

When a run waits for an OK that a tool step, which has no agent, asked for, the open run's status sentence shall name the step where an agent's name would be: `Tool step "<step id>"`. The step's id is never looked up or shown as an agent's name.

## Examples

- Given a run whose tool step `merge` waits for an OK on `merge_pull_request` from the connector `github`,
  when its status sentence is said,
  then it is `Run 650704 needs you. Waiting for your approval: Tool step "merge" wants to use merge_pull_request (github).`
