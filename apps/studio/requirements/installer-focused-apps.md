# studio.installer-focused-apps

- Status: active
- Since: unreleased
- Source: HAL-17903 (board report on HAL-10: searching "Halonic" in Windows found only the app); board direction HAL-17358 (one install with Studio plus focused apps); the launch in `studio.src-tauri.focused-apps`

When the Windows installer installs or updates Halonic, it shall put the Start menu shortcuts **Halonic Inbox** and **Halonic Messenger** beside **Halonic**, so Windows search finds them. Each shall start the installed `Halonic.exe` with `--app inbox` or `--app messenger` and carry the AppUserModelID `<identifier>.inbox` or `<identifier>.messenger`, the one its window sets, so each app has its own taskbar entry. An install that makes no shortcuts (`/NS`) shall make none of them either. When Halonic is uninstalled, and not updated, the uninstaller shall remove both shortcuts if they still start that install.

## Examples

- Given the installer template,
  when its install section runs,
  then it makes `Halonic Inbox.lnk` and `Halonic Messenger.lnk` in Halonic's Start menu folder, with `--app inbox` and `--app messenger`, on an update too.
- Given Halonic installed with both shortcuts,
  when it is uninstalled,
  then neither shortcut is left in the Start menu.
