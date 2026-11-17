# studio.entry

- Status: active
- Since: unreleased
- Source: HAL-1290 (T2), plan PR 16b; HAL-1291 (T3, the desktop app opens folders); HAL-1253 (the Android app ships none of the Studio); HAL-6261 (the served Studio's host settings); HAL-11118 (the desktop status bar's resources item)

When the Studio page loads, the app shall create the shell with the Studio's features. The served Studio shall open one workspace with its services, keeping its host settings in memory as it can't reach the profile, and show one Studio window for it (`shell.studio-window`); the desktop app shall start on the Welcome screen and open the folders the user picks (`studio.open-folder`). The desktop app shall give the window a watch over the shell's `resource_report` command, so the status bar shows the memory and free-disk item (`shell.resource-status-item`), and stop it with the window; the served Studio has no such command, so it shall get no watch and its status bar no item. Where the page runs in the desktop app's webview, the Studio shall run as the desktop app, and elsewhere as the served Studio. `Mod` shall mean ⌘ where the browser says it runs on macOS and Ctrl elsewhere. The Studio page shall be built apart from the Android app's connect page, so that the Android app ships none of the Studio. When the app stops the Studio, it shall take the window off the page and dispose the open workspaces' services.

## Examples

- Given the Studio page in a browser,
  when it loads,
  then it shows the window tabs and Home, as the served Studio.
- Given the served Studio's services,
  when the turn limit 20 is saved through their `HostSettingsStore`,
  then a read gives the turn limit 20.
- Given the Studio page in the desktop app's webview,
  when it loads,
  then it runs as the desktop app.
- Given a user agent with "Macintosh; Intel Mac OS X",
  then `Mod` means ⌘; with "Windows NT 10.0" or "X11; Linux x86_64", it means Ctrl.
- Given the desktop app with a folder open and a shell that reports 230 MB used and 48 GB free,
  when the window draws,
  then the status bar shows the resources item, and the shell was asked for `resource_report`.
- Given the served Studio,
  when the window draws,
  then the status bar has no resources item.
- Given a started Studio,
  when the app stops it,
  then the page's element is empty.
