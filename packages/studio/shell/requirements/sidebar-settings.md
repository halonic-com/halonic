# shell.sidebar-settings

- Status: active
- Since: unreleased
- Source: HAL-7331 (T11); flow-settings 2 and 12 (HAL-646); component specs 24.4, "Places" and "Settings" (HAL-175); C383 SP1 (HAL-14396)

Where the window gives the sidebar a way to open Settings, the sidebar shall show **Settings** last in the `nav` named "Places", under a divider, with the gear icon. It shall be a button, not a link, and never the current page. A click or Enter on it shall open Settings through the window's `openSettings` without asking for a section, so Settings shows the section shown last in this window, else Appearance. When Settings closes, the focus shall go back to the row, or, in a narrow window where the row is in the closed Places drawer, to the Places button. When a section opens a page as Settings closes, such as a plugin's page from Plugins, the focus shall go to that page's `h1` instead, at every width, also when the page draws it later.

## Examples

- Given the sidebar lists Home and Inbox,
  when it renders,
  then Settings follows them, after a divider, as a button with no `aria-current`.
- Given Settings showed Formats when it closed,
  when the user clicks **Settings** in the sidebar,
  then Settings opens on Formats.
- Given Settings was opened from the sidebar,
  when the user presses Escape,
  then Settings closes and the focus is back on **Settings** in the sidebar.
- Given a window 640px wide, with Settings opened from the Places drawer,
  when the user presses Escape,
  then Settings closes and the focus is on Places.
- Given a window 640px wide, with Settings opened from the Places drawer on Plugins,
  when the user opens Weather,
  then Settings closes, Weather's page opens, and the focus is on its `h1`, "Plugin Weather".
