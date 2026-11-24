# assistant.chat.model-per-chat

- Status: active
- Since: unreleased
- Source: HAL-16802 (T14 PR 11); req-assistant (HAL-110); flow-assistant 5.2 (HAL-647); UX checklist T14 1.4 (HAL-1361)

Where a chat is a Build chat, the chat shall show **Model:** with the chat's model as a menu that lists the Assistant model first when one is set, then the workspace's model aliases by name, the chat's own with a check, and picking one shall change the model of that chat only. A new Build chat shall start on the workspace's own assistant model, else the Settings › Assistant model, else the model of the most recent Build chat, else the alias `default`. A model that can't be used now shall be listed as unavailable with its reason, never hidden. Where a chat is an agent chat, the chat shall show the agent's model as text, not a menu.

## Examples

- Given chat "a" uses alias `default`, when the person picks `smart` in chat "a",
  then chat "a" answers with `smart` and other chats keep their model.
- Given no Assistant model is set and the last-used Build chat uses `smart`,
  when the person opens a new Build chat, then it starts on `smart`.
- Given alias `cloud` names a provider whose key isn't stored,
  then the Model menu lists `cloud` as unavailable with "Needs a key for Anthropic".
- Given workspace Acme is local only and alias `cloud` is a cloud model,
  then the Model menu lists `cloud` as unavailable with "Acme is local only".
- Given a chat with agent Triage, whose model is `smart`, then the chat shows "Model: smart (Triage's)" as text.
