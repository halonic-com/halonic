# shell.palette-entry

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.3 and 24.4 (HAL-175); UX checklist part 1, 1.2 and 1.3 (HAL-1323); design-direction 2; a11y 1.1; visual review kit T2-F39 (HAL-1115)

The sidebar shall show a Search box under the workspace switcher: a button named "Search" that looks like a field, with Mod K as a Kbd hint at its right and in its `aria-keyshortcuts`. When the user presses the Search box, the shell shall open the Ctrl K palette. When the user presses **+**, or Ctrl T where the Studio runs as the desktop app, the shell shall open a new tab on Home and the Ctrl K palette over it, with the focus in its search row.

## Examples

- Given the Studio on Windows,
  then the Search box shows Ctrl K and its `aria-keyshortcuts` is "Control+K";
  and given the Studio on macOS, it shows ⌘ K and is "Meta+K".
- Given a window with one tab on Agents,
  when the user presses **+**,
  then a second tab on Home is active and the palette is open with the focus in its search row.
- Given the desktop app,
  when the user presses Ctrl T,
  then a new tab on Home is active and the palette is open over it.
