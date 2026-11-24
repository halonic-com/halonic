# shell.panel-window

- Status: active
- Since: unreleased
- Source: HAL-16794 (T14 PR 5); flow-assistant 2.2, 5.8 and 7 (HAL-647); component specs 12 (S-D1, S-D5) and 21.1 (HAL-175); UX checklist T14 part 1 (HAL-1361)

When a feature adds a panel window with `panelWindows.add`, the desktop window shall draw the first one by `order` as its side panel, open or closed in each window, starting closed. While it is closed nothing of it shall be drawn. While it is open, on a window 900px or wider, the window shall draw its view docked at the right of the content area, 360px wide, between the title bar and the status bar, beside the page; on a narrower desktop window it shall cover the whole content area and the page shall be inert; below 600px it shall draw it as a full page (`shell.phone-panel`). The view shall get the feature's context, the contribution's title and a function that closes the panel. The window shall give every context it makes a `panelWindow` that tells whether the panel is open and shows, hides or toggles it, as the title bar button does. When the panel opens, the window shall remember what had focus. When the panel closes, by the view's close, the title bar button, `panelWindow` or Esc, the window shall move focus back to what had focus before it opened, or, when that is gone or inert, to the title bar button. The open panel shall be the `side-panel` layer of the window's close stack, active only while focus is inside it, so Esc closes it only then. While its view's code loads it shall show the loading state named by its title, and a view that fails shall show the page's failure state in its place.

## Examples

- Given the _assistant_ feature adds the panel window "Assistant",
  when a window 1440px wide opens,
  then the panel is closed and the title bar ends with the "Assistant" button.
- Given that window,
  when the user presses the "Assistant" button,
  then the panel is drawn 360px wide at the right of the content area beside the page, and the button is expanded.
- Given the panel open and focus in it,
  when the user presses Esc,
  then the panel closes and focus is back on what had focus before it opened.
- Given the panel open and focus in the page,
  when the user presses Esc,
  then the panel stays open.
- Given the panel was opened from a page that has since gone,
  when the user closes the panel with its ✕,
  then focus is on the "Assistant" button.
- Given a window 800px wide,
  when the panel opens,
  then it covers the content area and the page is inert; when it closes, the page can be used again.
- Given a window 1440px wide with the panel open,
  when the window narrows to 390px,
  then the panel stays open as a full page; and when it widens again, it is the side panel again.
- Given a feature's command calls `panelWindow.toggle()`,
  then the panel opens, and a second call closes it.
- Given two features add a panel window, with `order` 20 and 10,
  then the window draws the one with `order` 10.
