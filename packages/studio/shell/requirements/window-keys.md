# shell.window-keys

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); design direction 2 (HAL-49); UX checklist part 1, 1.2, 1.5 and 1.12 (HAL-1323); base component specs 9 and 23.1 (HAL-175); a11y A9 and A13

Where the Studio runs as the desktop app, the shell shall bind the window-wide keys, with `Mod` meaning Cmd on macOS and Ctrl elsewhere: Mod T shall open a new tab on Home and tell the frame, as **+** does; Mod W shall close the active tab; Mod Shift T shall reopen the last closed tab; Ctrl Tab and Ctrl Shift Tab shall activate the next and the previous tab, wrapping round, with Ctrl on macOS too; Mod 1 to Mod 8 shall activate the tab at that position and Mod 9 the last tab; F6 shall move the focus to the newest toast. A digit shall be read by its place on the keyboard, so Mod 1 works on layouts where the digits need Shift. The same keys with Alt, or with other modifiers than these, shall do nothing. The shell shall leave a key alone while a modal dialog is open, while an input method composes, and when the page has already handled it, and shall stop a key it uses from going further. Served Studio and the phone shall bind none of these keys, because the browser owns them.

## Examples

- Given the desktop app on Windows with tabs "Agents" and "Sorter", "Sorter" active,
  when the user presses Ctrl W,
  then "Sorter" closes and "Agents" is active; Ctrl Shift T brings "Sorter" back.
- Given the same tabs on macOS,
  when the user presses Cmd T,
  then a third tab opens on Home and is active, and the frame is told about it; Ctrl T does nothing.
- Given tabs "Agents", "Sorter" and "Support reply", "Agents" active,
  when the user presses Ctrl 9, then Ctrl 1, then Ctrl Shift Tab,
  then "Support reply", "Agents" and "Support reply" are active in turn.
- Given a toast is shown,
  when the user presses F6,
  then the focus moves to the toast.
- Given served Studio in a browser,
  when the user presses Ctrl W,
  then the Studio does nothing and leaves the key to the browser.
- Given an open Dialog,
  when the user presses Ctrl W,
  then the tab stays open.
