# studio.src-tauri.focused-apps

- Status: draft
- Since: unreleased
- Source: HAL-17903; board direction HAL-17358 (one install with Studio plus focused apps); the shortcuts in `studio.installer-focused-apps`

When Halonic starts on the desktop with `--app inbox` or `--app messenger`, the shell shall open that app's own window instead of Studio's: the same page, under the window label `inbox` or `messenger`, titled "Halonic Inbox" or "Halonic Messenger" until the page sets a title, and on Windows with the AppUserModelID `<identifier>.inbox` or `<identifier>.messenger`, so it has its own taskbar entry. An `--app` naming no app opens Studio. Halonic shall run once: a second start shall hand its arguments to the running Halonic, which opens the window they ask for, or brings it forward when it is already open, so every window shares one connection, engine lock and cache. The app windows shall be granted the same commands as Studio's window.

## Examples

- Given Halonic running with Studio's window open,
  when the Start menu's Halonic Inbox is opened,
  then an Inbox window opens beside Studio's, with its own taskbar entry, and no second Halonic keeps running.
- Given the Inbox window open and minimised,
  when Halonic Inbox is opened again,
  then that window is restored and focused, and no second Inbox window opens.
- Given Halonic started with `--app runs`,
  then Studio's window opens.
