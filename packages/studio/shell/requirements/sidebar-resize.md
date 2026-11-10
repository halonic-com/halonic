# shell.sidebar-resize

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); UX checklist part 1, 1.3, revision 6 (HAL-1323, settled in HAL-3077); visual review kit T2-F41 and F42 (HAL-3056)

The shell shall give the desktop sidebar a resize edge right after the sidebar and before the page: an 8px hit area over the sidebar's border that takes no room, which draws a 2px `accent` line on hover, while dragging and on keyboard focus only. The edge shall be one Tab stop, a vertical `separator` named "Resize sidebar" that controls the sidebar, with a minimum of 180, a maximum of 640, the width as its value and "<width> pixels" as its value text. **←** shall make the sidebar 16px narrower and **→** 16px wider, **Home** shall set 180px, **End** 640px, and **Enter** 264px, as a double-click does; the width shall stop at 180 and 640, with no wrap. These keys with Ctrl, Alt, Shift or Meta shall be left to the browser and the keybindings. A drag shall set the width within the same limits. The shell shall save the width when the key or the pointer is released, only when the width changed, and shall announce nothing, because the separator's value is read out.

## Examples

- Given the sidebar at 264px and the focus on its edge,
  when the user presses →,
  then the sidebar is 280px, the edge's value text is "280 pixels", and 280 is saved when the key is released.
- Given the sidebar at 400px,
  when the user presses Home, then End, then Enter,
  then it is 180px, then 640px, then 264px.
- Given the sidebar at 632px,
  when the user presses → twice,
  then it stops at 640px.
- Given a drag of the edge to 900px,
  when the pointer is released,
  then the sidebar is 640px and 640 is saved.
- Given the sidebar at 500px,
  when the user double-clicks the edge,
  then it is 264px and 264 is saved.
- Given the edge has focus,
  when Alt+→ is pressed,
  then the key goes on to the browser and nothing is resized or saved.
