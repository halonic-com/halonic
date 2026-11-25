# inbox.tool-step-asker

- Status: active
- Since: unreleased
- Source: HAL-18635 (the `tool` step kind, `engine.tool-state`; its approvals carry `step: "tool"`, `events.tool-step-marker`); the wording is decided in the review on HAL-18635

When a tool step, which has no agent, waits for an OK, the row and the card of its call shall name the step where an agent's name would be: `Tool step "<step id>"`, so the title reads `Tool step "<step id>" wants to use <tool> (<connector>)`. The step's id is never looked up or shown as an agent's name.

## Examples

- Given the tool step `merge` waiting for an OK on `merge_pull_request` from the connector `github`,
  when the Inbox shows it,
  then its title is `Tool step "merge" wants to use merge_pull_request (github)`.
- Given an agent `merge` and the same call from that agent,
  when the Inbox shows it,
  then its title names the agent, as before.
