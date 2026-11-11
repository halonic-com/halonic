# shell.window-tab-menu

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); UX checklist part 1, 1.2 (HAL-1323); base component specs 14 (Menu) and 24.5 (window tabs)

When the focus is on a window tab and the user presses Shift F10 or the Menu key, the shell shall open that tab's menu below the tab with the focus on its first usable item; when the user right-clicks a tab, the shell shall open its menu at the pointer without making the tab active, and the browser's own menu shall not open. Shift F10 with Ctrl, Alt or Meta shall be left to the window. The menu shall be the kit's `ContextMenu` (`kit.context-menu`), named by the tab's title, with the items Close, Close other tabs and Reopen closed tab. Where the Studio runs as the desktop app, Close shall show Mod W and Reopen closed tab Mod Shift T, the keys `shell.window-keys` binds there, written as `shell.key-hints` says; served Studio shall show no keys, since the browser owns them. Close other tabs shall be disabled while only one tab is open, and Reopen closed tab while no closed tab can come back. Close shall close the tab and move the focus to the tab that became active, or to the one now in its place. Close other tabs shall close every other tab, make this one active and keep the focus on it, and Ctrl Shift T or Reopen closed tab shall bring the closed ones back one by one, each in its old place. Reopen closed tab shall bring back the last closed tab and move the focus to it. Escape shall close the menu with the focus back on the tab.

## Examples

- Given tabs "Agents", "Support reply" and "Sorter", with "Support reply" active and focused,
  when the user presses Shift F10,
  then the menu "Support reply" opens below the tab with Close focused, and Reopen closed tab is disabled.
- Given the desktop app on Windows,
  when the user opens a tab's menu,
  then Close shows Ctrl W and Reopen closed tab shows Ctrl Shift T; served Studio shows neither.
- Given the same tabs,
  when the user right-clicks "Agents",
  then the menu "Agents" opens at the pointer and "Support reply" stays the active tab.
- Given the menu open from the keyboard on "Support reply",
  when the user picks Close,
  then the tabs are "Agents" and "Sorter", and "Sorter", now active, has the focus.
- Given the menu open on "Agents",
  when the user picks Close other tabs,
  then only "Agents" is open and has the focus; and when the user opens the menu again and picks Reopen closed tab, "Support reply" comes back after it and has the focus.
