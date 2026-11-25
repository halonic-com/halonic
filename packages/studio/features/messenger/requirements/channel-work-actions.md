# messenger.channel-work-actions

- Status: active
- Since: unreleased
- Source: Sofia's flows HAL-17509 (flow J); Noah's wording table HAL-17514 (row k11b); the phase 2 card approved by the board on HAL-17544 (24 Nov); HAL-18223.

Where a work line under the person's message in a channel says the agent's task ended without an answer, it shall offer **Ask again**, which sends the same message again to that agent only. While the channel's source is offline, a working agent's line shall say when the source was last read, "Elena · working, as of 14:02", instead of counting minutes.

## Examples

- Given a message of the person's to Elena and Liam whose task closed without an answer for Elena,
  when the person presses **Ask again** on Elena's line,
  then the same text is sent again, to Elena only.
- Given a message Elena is working on, and the channel's source went offline at 14:02,
  when the channel shows it,
  then Elena's line says "Elena · working, as of 14:02".
