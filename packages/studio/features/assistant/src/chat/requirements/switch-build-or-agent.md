# assistant.chat.switch-build-or-agent

- Status: active
- Since: unreleased
- Source: HAL-16802 (T14 PR 11); req-assistant (HAL-110); flow-assistant 5.3 (HAL-647); UX checklist T14 1.4 (HAL-1361)

The chat shall show **Chat with:** as a menu with "Build the workspace" first, then the workspace's agents by name. When the person picks another choice than the chat's, the chat shall start over with no messages and talk to that choice, and a chat that had messages shall stay in the recent chats. A chat with an agent shall answer with the agent's own model, instructions and skills, and without authoring tools.

## Examples

- Given a Build chat with 4 messages, when the person picks agent "Triage" in "Chat with",
  then the chat is empty, talks to "Triage" with Triage's own model, instructions and skills,
  has no authoring tools, and the Build chat stays in the recent chats.
- Given a chat with "Triage", when the person picks "Build the workspace",
  then the chat is an empty Build chat.
