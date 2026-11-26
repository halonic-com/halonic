# messenger.activity-channel

- Status: active
- Since: unreleased
- Source: the activity-panel document on HAL-18558 (revision 3, section 2), approved by the board on 25 Nov, 13:42 UTC; built on HAL-18567, with Liam's review of halonic#6461.

While a channel is open and an agent host serves the agents' activity, the Messenger shall offer the activity panel, building on `messenger.activity-panel` and `messenger.activity-widths`, listing the channel's agents one line each, the lead first: the agent's name and "Working on" its task, "Working", "Starting" or "Idle". Picking a line shall show that agent's activity as a direct chat with it would, but never "This chat · Answering you", with **‹ Channel** to go back to the lines. The header button shall show its dot while any of the channel's agents is working.

When the person presses **Ctrl+I** while the panel is open, the panel shall close as its own **×** or **‹ Chief** closes it, and put focus back on the header button.

## Examples

- Given the channel "Launch" with Liam working on HAL-18592 and Noah idle,
  when the person opens it,
  then the panel lists "Liam · Working on HAL-18592" and "Noah · Idle"; picking Liam shows "Working · for 7 min" and **‹ Channel**, which brings the lines back.
- Given a window 1000 px wide and Chief's activity open as a sheet,
  when the person presses **Ctrl+I**,
  then the sheet closes and focus is on the chat header's button.
