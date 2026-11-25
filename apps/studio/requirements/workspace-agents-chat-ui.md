# studio.workspace-agents-chat-ui

- Status: active
- Since: unreleased
- Source: HAL-17649 (OpenUI A5); OpenUI plan approved by the board on 23 Nov (HAL-17107); Liam's review HAL-16863

When the desktop app answers a Try it message for an agent whose file has a `chatUi` block, it shall put `promptFor` with that block's components, and only those, before the conversation as a system message; for an agent without `chatUi` it shall send the conversation as it is. Everything else about the answer (trust, the agent's tools, `asks`, `allowedSites` and approvals) shall stay as `studio.workspace-agents-chat` says. The agent's settings shall carry the components, so the chat knows what it may draw.

## Examples

- Given the agent `writer` with `chatUi: { components: [card, buttons] }`,
  when the feature asks for an answer to "Sort this mail",
  then the engine gets `promptFor(["card", "buttons"])` as a system message, then "Sort this mail", and the agent's settings list `card` and `buttons`.
- Given the agent `writer` with no `chatUi`,
  when the feature asks for an answer,
  then the engine gets only the conversation, and the settings have no `chatUi`.
