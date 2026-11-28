# shell.sidebar-settings

- Status: active
- Since: unreleased
- Source: HAL-7331 (T11); flow-settings 2 and 12 (HAL-646); component specs 24.4, "Places" and "Settings" (HAL-175); C383 SP1 (HAL-14396); moved to the rail, HAL-20676 (P3 of the HAL-20617 build plan), HAL-20673 rail flows

Where the window gives the icon rail a way to open Settings, the rail shall show **Settings** at its bottom, apart from the other entries, with the gear icon (`shell.rail`). It shall be a button, not a link, and never the current page, and the sidebar shall show no Settings row of its own. A click or Enter on it shall open Settings through the window's `openSettings` without asking for a section, so Settings shows the section shown last in this window, else Appearance. When Settings closes, the focus shall go back to the rail's Settings button, at every desktop width, as the rail stays outside the narrow window's Places drawer. When a section opens a page as Settings closes, such as a plugin's page from Plugins, the focus shall go to that page's `h1` instead, at every width, also when the page draws it later.

## Examples

- Given the window shows the rail,
  when it renders,
  then Settings sits at the rail's bottom as a button with no `aria-current`, and the sidebar has no Settings row.
- Given Settings showed Formats when it closed,
  when the user clicks **Settings** on the rail,
  then Settings opens on Formats.
- Given Settings was opened from the rail,
  when the user presses Escape,
  then Settings closes and the focus is back on **Settings** on the rail.
- Given a window 640px wide, with Settings opened from the rail,
  when the user presses Escape,
  then Settings closes and the focus is back on **Settings** on the rail.
- Given a window 640px wide, with Settings opened from the rail on Plugins,
  when the user opens Weather,
  then Settings closes, Weather's page opens, and the focus is on its `h1`, "Plugin Weather".
