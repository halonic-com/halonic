# studio.src-tauri.app-frames

- Status: draft
- Since: unreleased
- Source: HAL-20468 (board request: FancyZones, Snap and the taskbar keep one place per exe, so Studio, the Inbox and the Messenger shared one); the windows in `studio.src-tauri.focused-apps`; the places in `studio.src-tauri.window-place`

On Windows, Halonic Inbox and Halonic Messenger shall each have a frame of its own: an exe next to Halonic's (`Halonic Inbox.exe`, `Halonic Messenger.exe`), a hard link to or copy of Halonic's own exe, that owns the app's top-level window, so window managers that key on a window's exe tell the apps apart. When Halonic's exe is started under a frame's name, it shall run only that app's frame and shall not start Halonic. A frame shall run once per app: a second start shall bring the first one's window forward and quit. A frame shall carry its app's title until the page sets one, its app's icons and the AppUserModelID `<identifier>.inbox` or `<identifier>.messenger`, and shall open where it last closed, kept per app in the user's registry, or else where Windows and its shortcut put a new window. It shall then start Halonic with `--app <name> --host-window <its window>`. Halonic shall open the app's window, with the same page and label, as a child that fills the frame, only when the window handed over belongs to that app's own frame exe in Halonic's own folder; any other window shall be refused and its frame asked to close. The page's title and title bar colour shall go to the frame, and bringing the app's window forward shall bring its frame forward. Closing the frame shall ask Halonic's window to close; when that window is gone, or none came within a minute, the frame shall quit. Every other start of the app, such as `--app inbox` from an older shortcut, the tray, quick ask's chat or the windows reopened at start, shall start the app's frame instead, when Halonic's folder holds one; without one the window shall open in Halonic as before.

## Examples

- Given Halonic running with Studio's window open,
  when `Halonic Inbox.exe` starts,
  then an Inbox window opens whose top-level window belongs to `Halonic Inbox.exe`, with the Inbox page inside it.
- Given the Inbox open in its frame,
  when `Halonic Inbox.exe` starts again,
  then the frame comes forward and no second Inbox opens.
- Given Halonic running,
  when it is started with `--app messenger` and `Halonic Messenger.exe` is next to it,
  then the Messenger opens in its frame.
- Given Halonic started with `--app inbox --host-window` naming a window of another program,
  then no page opens in it.
- Given the Inbox snapped to the left of the screen,
  when its frame closes and opens again,
  then it opens on the left of the screen.
