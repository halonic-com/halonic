# messenger.channel-picker-add

- Status: active
- Since: unreleased
- Source: Sofia's flows HAL-17509 (flow I); Noah's wording table HAL-17514 (row k10c); Julian's security note HAL-17513 (finding M5); the phase 2 card approved by the board on HAL-17544 (24 Nov); HAL-18223.

Where the person types `@` and a name in a channel's box that matches no member but an agent of the channel's source, the Messenger shall say, above the box, "Writer isn't in this channel." with **Add Writer**, and "Only members can be named here.". **Add Writer** shall change the members the way the Members panel does (`messenger.members`): in a channel with messages it first shows "Writer will see all earlier messages in Engineering." and changes nothing until the person confirms.

## Examples

- Given the channel "Engineering" with messages, and Writer in its source but not in the channel,
  when the person types "@Wri" in its box,
  then the Messenger says, above the box, "Writer isn't in this channel." with **Add Writer**, and "Only members can be named here.".
- Given the same channel,
  when the person presses **Add Writer**,
  then the Messenger shows "Writer will see all earlier messages in Engineering." and the members change only once the person confirms with **Add Writer**.
