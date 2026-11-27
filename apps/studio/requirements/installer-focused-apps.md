# studio.installer-focused-apps

- Status: active
- Since: unreleased
- Source: HAL-17903 (board report on HAL-10: searching "Halonic" in Windows found only the app); board direction HAL-17358 (one install with Studio plus focused apps); the launch in `studio.src-tauri.focused-apps`; the frames in `studio.src-tauri.app-frames` (HAL-20468, HAL-20480)

When the Windows installer installs or updates Halonic, it shall put the Start menu shortcuts **Halonic Inbox** and **Halonic Messenger** beside **Halonic**, so Windows search finds them. The installer shall put the apps' frames next to `Halonic.exe` as `Halonic Inbox.exe` and `Halonic Messenger.exe`. Each shortcut shall start its app's installed frame, with no arguments, and carry the AppUserModelID `<identifier>.inbox` or `<identifier>.messenger`, the one its frame sets, so each app has its own taskbar entry and window managers keep its place apart from Studio's. An install that makes no shortcuts (`/NS`) shall make none of them either. Before it replaces or removes the frames, the installer and the uninstaller shall wait, as for Halonic's helpers, until no frame of that install still holds its exe, and with pages the installer shall count a running frame as Halonic being open. When Halonic is uninstalled, and not updated, the uninstaller shall remove both frames, the frames' places in the user's registry (`Software\Halonic\Frames`) and both shortcuts if they still start that install, whether they start its frame or, as before the frames, `Halonic.exe` with `--app inbox` or `--app messenger`.

## Examples

- Given the installer template,
  when its install section runs,
  then it makes `Halonic Inbox.lnk` and `Halonic Messenger.lnk` in Halonic's Start menu folder, starting `Halonic Inbox.exe` and `Halonic Messenger.exe`, on an update too.
- Given Halonic installed with both shortcuts,
  when it is uninstalled,
  then neither shortcut, neither frame and no `Software\Halonic\Frames` key is left.
- Given Halonic updated while a frame is still closing,
  when the installer copies the new frames,
  then it waits for that frame's exe to be free first.
