# shell.panel-width

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); req-shell `shell.panels.width-drag` and `shell.panels.narrow-becomes-button` (HAL-110); UX checklist part 1, 1.10 (HAL-1323)

The shell shall keep an item page's side panel between 420 and 1400px wide, start it at 700px on a computer with no saved width or a saved width that isn't a number, and start it at the saved width, kept inside 420 to 1400, otherwise. While the tab is too narrow for the chosen width, the shell shall narrow the panel so the chat keeps 320px, never under 420px, and give the chosen width back when the tab widens. While the tab has no room for a 420px panel beside a 320px chat, with the 48px gap and the 40px lead, the shell shall show no panel beside the chat, so the item page shows it as a button.

While the panel is beside the chat, the shell shall give it a resize edge on its left: one Tab stop, a vertical `separator` named "Resize panel" that controls the panel, with a minimum of 420, a maximum of 1400 or the widest that leaves the chat 320px, the width as its value and "<width> pixels" as its value text, drawn as the sidebar's edge is (`shell.sidebar-resize`). A drag shall set the width within the same limits. **←** shall make the panel 16px wider and **→** 16px narrower, **Home** shall set the minimum, **End** the maximum, and **Enter** 700px, as a double-click does. These keys with Ctrl, Alt, Shift or Meta shall be left to the browser and the keybindings. The shell shall give the width to every item page in the window and save it on this computer when the key or the pointer is released, only when it changed, and shall announce nothing, because the separator's value is read out.

## Examples

- Given nothing saved on this computer,
  when an item page opens in a wide tab,
  then its panel is 700px wide.
- Given a saved width of 812,
  when an item page opens in a 1600px tab,
  then its panel is 812px wide.
- Given a width dragged towards 1600px or 300px,
  then the panel stops at 1400px or 420px.
- Given a saved value that is not a number,
  then the panel is 700px wide.
- Given a chosen width of 812 in a 1000px tab,
  then the panel is 592px wide and the chat 320px.
- Given a tab 800px wide,
  then no panel shows beside the chat; at 828px a 420px panel does.
- Given the panel at 700px in a 1600px tab and the focus on its edge,
  when the user presses ←,
  then the panel is 716px, on this item page and every other one, and 716 is saved when the key is released.
- Given the panel at 812px in a 1600px tab,
  when the user presses Home, then End, then Enter,
  then it is 420px, then 1192px, then 700px.
- Given the panel at 900px,
  when the user double-clicks its edge,
  then it is 700px and 700 is saved.
- Given the chat closed, the panel closed with its ✕, or a tab too narrow for the panel beside the chat,
  then there is no resize edge.
