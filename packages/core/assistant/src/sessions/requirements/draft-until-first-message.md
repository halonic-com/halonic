# assistant.sessions.draft-until-first-message

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U26 (Now); flow-assistant 5.4 (HAL-647); req-assistant (HAL-110); HAL-16791

While a chat has no message from the person, the assistant shall keep it as a draft that is not saved and not listed in the recent chats.

## Examples

- Given a new Build chat with no messages,
  when it is prepared for saving,
  then nothing is saved.
- Given the person sends "Add a skill" in a new chat,
  when it is prepared for saving,
  then it is saved with that message.
