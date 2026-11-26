# messenger.activity-widths

- Status: active
- Since: unreleased
- Source: the activity-panel document on HAL-18558 (revision 3, sections 1, 3 and 4), approved by the board on 25 Nov, 13:42 UTC; built on HAL-18567, with Julian's review of halonic#6324.

While a direct chat is open in a window narrower than 1200 px and an agent host serves the agents' activity, the Messenger shall offer the chat agent's activity panel, building on `messenger.activity-panel`, closed when the chat opens and never opened or closed by itself. In a window from 900 to 1199 px wide, the chat header's button shall open the panel as a sheet over the chat's right side, without narrowing the chat; **Esc** or **×** closes it and puts focus back on the button. In a window narrower than 900 px, the button or **Show activity** shall show the panel instead of the chat, with **‹ Chief** to go back to the chat as it was. A sheet or a place shall take the focus as it opens.

When only the read of the tasks the agent holds fails, the panel shall show the rest of the agent's activity with nothing under **Next**.

## Examples

- Given a window 1000 px wide and Chief working on ACME-7,
  when the person opens Chief's chat,
  then the panel is closed and the header button shows its dot; pressing the button opens "Chief's activity" over the chat, and **Esc** closes it and focuses the button.
- Given a window 600 px wide,
  when the person presses the chat header's button,
  then "Chief's activity" shows instead of the chat, and **‹ Chief** brings back the chat with its message box as it was.
- Given the agent's task list can't be read,
  when the panel shows Chief working on ACME-7,
  then it shows "Working · for 7 min" and no **Next**.
