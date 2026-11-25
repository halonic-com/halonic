# studio.installer-start-menu-refresh

- Status: active
- Since: unreleased
- Source: HAL-18322 (board report on HAL-10: no Halonic Inbox or Halonic Messenger after installing a preview over the previous one); board direction on HAL-10, 25 Nov: "the installer should remove all old shortcuts, and install the new ones at all times"

When the Windows installer runs, whether as a fresh install, an install over an older version, an update, Repair or run again without Repair, it shall first remove every Start menu shortcut in Halonic's Start menu folder and Halonic's shortcut at the top of the Start menu, then make the current set in that folder: **Halonic**, **Halonic Inbox** and **Halonic Messenger** (`studio.installer-focused-apps`). An install that makes no shortcuts (`/NS`) shall leave the Start menu as it is. The desktop shortcut keeps following the box on the install page.

## Examples

- Given an older Halonic whose Start menu folder holds a shortcut this version no longer makes, and no Halonic Inbox,
  when the new version is installed over it,
  then the folder holds exactly `Halonic.lnk`, `Halonic Inbox.lnk` and `Halonic Messenger.lnk`.
- Given Halonic installed,
  when the same version is run again, with or without Repair,
  then the folder again holds exactly those three shortcuts.
- Given Halonic installed,
  when the updater installs a newer version,
  then the folder holds exactly those three shortcuts, Halonic's own included.
