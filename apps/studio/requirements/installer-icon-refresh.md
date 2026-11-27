# studio.installer-icon-refresh

- Status: active
- Since: unreleased
- Source: HAL-20463 (board report on HAL-10, 27 Nov: after the new icons of HAL-19716 were installed, the taskbar kept the old Halonic and Halonic Messenger icons, even after unpinning and pinning again, until the Windows icon cache was cleared by hand)

When the Windows installer runs, whether as a fresh install, an install over an older version, an update, Repair or run again without Repair, it shall copy the icons of Halonic, Halonic Inbox and Halonic Messenger to files whose names carry the installed version, remove the copies an earlier version made, point every shortcut that starts this install's Halonic at its app's copy (in Halonic's Start menu folder, on the desktop and pinned to the taskbar), and then tell Windows that icons changed, so the taskbar and the Start menu show the new icons with no manual step and no restart. An install that makes no shortcuts (`/NS`) shall still point the shortcuts that are there at the new copies. The installer shall never delete Windows' icon cache or stop Explorer.

## Examples

- Given an older Halonic with Halonic Messenger pinned to the taskbar,
  when a version whose Messenger icon changed is installed over it,
  then the pinned shortcut's icon is `icons\messenger-<version>.ico` of the new version, and the taskbar shows the new icon.
- Given a shortcut pinned to the taskbar that starts another program,
  when Halonic is installed,
  then that shortcut is left as it was.
- Given Halonic installed,
  when it is uninstalled,
  then no versioned icon copy is left in its folder.
