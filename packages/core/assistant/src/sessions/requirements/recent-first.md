# assistant.sessions.recent-first

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U26 (Now); flow-assistant 5.4 (HAL-647); req-assistant (HAL-110); HAL-16791

The assistant shall list chats most recently used first.

## Examples

- Given chat "a" last used at 10:00 and chat "b" last used at 11:00 on 5 Nov 2026,
  when the recent chats are listed,
  then "b" comes before "a".
- Given chat "b" last used at 10:00 UTC and chat "a" at 11:30 in UTC+02:00 the same day, then "b" comes first.
