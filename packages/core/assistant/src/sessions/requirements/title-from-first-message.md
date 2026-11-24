# assistant.sessions.title-from-first-message

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U60, U26 (Now); flow-assistant 5.4 (HAL-647); req-assistant (HAL-110); HAL-16791

When the first message of a chat titled "New chat" is sent, the assistant shall title the chat with that message's first line, spaces collapsed, cut to 57 characters plus "…" when it is longer than 60.

## Examples

- Given a new chat,
  when the person sends "  Add a routine\nthat runs daily",
  then the chat is titled "Add a routine".
- Given a first message of 80 "x" characters, then the title is 57 "x" characters followed by "…".
- Given a first message of exactly 60 characters, then the title is the whole message.
- Given a first message of only spaces, then the title stays "New chat".
- Given an old saved chat titled "New session", then it shows as "New chat" and still takes its title from its first message.
- Given a chat the person renamed "Routines", when another message is sent, then the title stays "Routines".
