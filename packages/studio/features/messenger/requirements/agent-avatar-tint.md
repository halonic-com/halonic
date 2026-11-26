# messenger.agent-avatar-tint

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), point 3; built on HAL-19763

Where an agent's chat shows the agent's initials, in the chat list, the chat's header, Needs you and above the agent's messages, the Messenger shall draw them on the agent's own tint, the same as its bubbles (`messenger.agent-bubbles`, `kit.avatar-tint`). A question asked in a channel shall show its asker's initials in Needs you on that agent's tint. A channel's picture shall show its members, each on their own tint (`messenger.channel-picture`).

## Examples

- Given Chief's chat, with no picture for Chief,
  when the board opens it,
  then Chief's initials in the list, in the header and above Chief's messages sit on the tint of Chief's bubbles.
- Given Elena asked "Which hostname?" in the channel Engineering,
  when the board opens Needs you,
  then Elena's initials beside the question sit on Elena's tint, and so does Elena's tile in Engineering's picture in the list.
