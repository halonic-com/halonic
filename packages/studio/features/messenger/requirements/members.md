# messenger.members

- Status: active
- Since: unreleased
- Source: Sofia's flows HAL-17509 (flow H); Noah's wording table HAL-17514 and the history notice on HAL-18165; Julian's security note HAL-17513 (finding M5); the phase 2 card approved by the board on HAL-17544 (24 Nov); HAL-18124.

Where a conversation is a channel, the Messenger shall show its Members: each agent with what it is doing, the lead marked "Lead", and **Make lead**, **Remove from channel** and **Add an agent**. When the person adds an agent to a channel that has messages, it shall first say "Writer will see all earlier messages in Engineering." with **Add Writer** and **Cancel**, and shall not change the members until the person presses **Add Writer**; a channel with no messages yet adds the agent at once. Removing the lead shall ask for a new lead first ("Remove Chief?" / "Chief is the lead. Pick a new lead first."). A channel keeps 2 to 8 agents: with 2 left, **Remove from channel** can't be pressed and the panel says "A channel needs at least 2 agents. Add one, or archive the channel."; with 8, **Add an agent** can't be pressed and says "A channel can have up to 8 agents.". A member the source no longer lists shows as "No longer in" and the source's label. Leaving asks "Leave Engineering?" once, with "You can join again from Browse channels." and **Leave**.

## Examples

- Given the channel "Engineering" with messages, Chief as its lead and Liam and Elena as members, and Writer in the same source,
  when the person picks Writer under **Add an agent**,
  then the Messenger shows "Writer will see all earlier messages in Engineering." and the members are unchanged until the person presses **Add Writer**.
- Given the same channel,
  when the person picks Writer and then presses **Cancel**,
  then Writer isn't added.
- Given a channel with no messages yet,
  when the person picks Writer under **Add an agent**,
  then Writer is added without a notice.
- Given the same channel,
  when the person presses **Remove from channel** on Chief, picks Liam as the new lead and presses **Remove Chief**,
  then the channel has Liam as its lead and Elena as its other member.
- Given a channel of 2 agents,
  when the person opens Members,
  then **Remove from channel** can't be pressed and the panel says why.
- Given the channel "Engineering",
  when the person presses **Leave channel**,
  then the Messenger asks "Leave Engineering?" once, and after **Leave** the channel is gone from the list.
