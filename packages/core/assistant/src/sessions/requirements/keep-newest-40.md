# assistant.sessions.keep-newest-40

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U60, U26 (Now); flow-assistant 5.4 (HAL-647); req-assistant (HAL-110); states row H14 (HAL-5896); HAL-16791

The assistant shall keep the 40 most recently used chats of each workspace on this device between launches, Build and agent chats in one list, without drafts and with no chat marked busy. A chat that was answering when Halonic closed shall come back not busy, with the messages it had, and say "Stopped when Halonic closed."

## Examples

- Given 41 chats with messages in workspace "acme",
  when the chats to keep are worked out,
  then the oldest one is dropped.
- Given 40 Build chats and one agent chat used before all of them, then the agent chat is dropped.
- Given a chat was answering when the app closed,
  when it comes back,
  then it is not busy, keeps its messages, and is marked stopped when Halonic closed.
