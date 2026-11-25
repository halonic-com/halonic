# studio.src-tauri.login-item-commands

- Status: draft
- Since: unreleased
- Source: HAL-14221; decision D9 of the B1 design note (HAL-14206) with the security review's changes (HAL-14212, section 5)

When the page calls `login_item_get`, the shell shall answer whether Halonic's login item is on. When the page calls `login_item_set` with on or off, the shell shall turn the login item on or off as `studio.src-tauri.crates.login-item.login-item` says, and answer whether it is on afterwards; it shall take nothing else from the page, so the page can't choose the entry's arguments or path. If Halonic doesn't run from where it was installed, then turning it on shall be refused as `not_installed`; any other failure shall be refused as `failed`, with the reason in the shell's log, never a path in the answer. Turning it off shall work wherever Halonic runs from. The two commands shall be granted to the app's own local main window on desktop only, never to a focused app's window, the Studio the computer serves, or any window as the autostart plugin's own commands. When Halonic is uninstalled, not updated, the uninstaller shall remove the login item's `Run` value.

## Examples

- Given the login item is off and Halonic runs from its install folder,
  when the page calls `login_item_set` with on,
  then the answer is on.
- Given Halonic run from a download folder,
  when the page calls `login_item_set` with on,
  then the answer is `not_installed` and the login item stays off.
- Given the login item is on and Halonic was moved,
  when the page calls `login_item_set` with off,
  then the answer is off.
- Given the login item is on,
  when Halonic is uninstalled,
  then this user's `Run` key has no value `Halonic`.
