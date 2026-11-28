# shell.sidebar-resize

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); UX checklist part 1, 1.3, revision 6 (HAL-1323, settled in HAL-3077); visual review kit T2-F41 and F42 (HAL-3056); the list column's width, HAL-20676 (P3 of the HAL-20617 build plan)

Where the window shows the icon rail, the shell shall make the sidebar, the rail's list column, 34% of the window wide, kept inside 180 to 380px, and shall follow the window's width as it resizes until the person sets a width with the edge. The shell shall give the desktop sidebar a resize edge right after the sidebar and before the page: an 8px hit area over the sidebar's end edge that takes no room, which draws a 2px `accent` line on hover, while dragging and on keyboard focus only. The edge shall be one Tab stop, a vertical `separator` named "Resize sidebar" that controls the sidebar, with a minimum of 180, a maximum of 380, the width as its value and "<width> pixels" as its value text. **←** shall make the sidebar 16px narrower and **→** 16px wider, **Home** shall set 180px, **End** 380px, and **Enter** the window's own width for the column, else 264px, as a double-click does, after which the column follows the window again; the width shall stop at 180 and 380, with no wrap. These keys with Ctrl, Alt, Shift or Meta shall be left to the browser and the keybindings. A drag shall set the width within the same limits. The shell shall save the width when the key or the pointer is released, only when the width changed, and shall announce nothing, because the separator's value is read out. Where the window is narrow, 600 to 899px wide, the shell shall show no resize edge, because the sidebar is then the 264px Places drawer.

## Examples

- Given the sidebar at 264px and the focus on its edge,
  when the user presses →,
  then the sidebar is 280px, the edge's value text is "280 pixels", and 280 is saved when the key is released.
- Given a sidebar with no window around it, at 300px,
  when the user presses Home, then End, then Enter,
  then it is 180px, then 380px, then 264px.
- Given the sidebar at 372px,
  when the user presses → twice,
  then it stops at 380px.
- Given a drag of the edge to 900px,
  when the pointer is released,
  then the sidebar is 380px and 380 is saved.
- Given a sidebar with no window around it, at 300px,
  when the user double-clicks the edge,
  then it is 264px and 264 is saved.
- Given a window 1024px wide,
  when the list column renders,
  then it is 348px wide; widened to 1440px, it is 380px.
- Given the person set the column to 300px in a window 1024px wide,
  when the window widens to 1100px,
  then the column stays 300px; after Enter on the edge, it follows the window again.
- Given the edge has focus,
  when Alt+→ is pressed,
  then the key goes on to the browser and nothing is resized or saved.
- Given the window narrowed to 800px,
  when the sidebar renders,
  then there is no resize edge; widened to 1024px, it is back.
