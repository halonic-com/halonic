# messenger.activity-channel-states

- Status: active
- Since: unreleased
- Source: Noah's design check of the channel view on HAL-20156 (findings 1–3), building on the activity-panel document on HAL-18558 (revision 3, section 2), approved by the board on 25 Nov, 13:42 UTC; built on HAL-18567.

While a channel's activity panel lists its agents (`messenger.activity-channel`) and the first read of their activity isn't back, the Messenger shall show each agent's name with a loading bar where its status goes, and no status. If that first read fails, the panel shall say "Couldn't read the activity in Launch" with **Try again**; if a later read fails, it shall keep the lines last read under "showing what it said last". Each line shall end in a chevron that says it opens the agent's view. In an agent's view, **‹ Channel** shall sit in the panel header's leading slot, taking the place of a narrow window's **‹ Launch**, so each level has one back link.

## Examples

- Given the channel "Launch" with Liam and Noah, and the agent host not answering yet,
  when the person opens it,
  then the panel lists "Liam" and "Noah" with a loading bar each, and neither shows "Idle".
- Given a window 800 px wide and the channel "Launch" open with its panel,
  when the person picks Liam,
  then the header leads with **‹ Channel**, not **‹ Launch**, and focus is on it.
