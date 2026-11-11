# studio.entry

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 16b; HAL-1291 (T3, the desktop app opens folders); HAL-1253 (the Android app ships none of the Studio)

When the Studio page loads, the app shall create the shell with the Studio's features. The served Studio shall open one workspace with its services and show one Studio window for it (`shell.studio-window`); the desktop app shall start on the Welcome screen and open the folders the user picks (`studio.open-folder`). Where the page runs in the desktop app's webview, the Studio shall run as the desktop app, and elsewhere as the served Studio. `Mod` shall mean ⌘ where the browser says it runs on macOS and Ctrl elsewhere. The Studio page shall be built apart from the Android app's connect page, so that the Android app ships none of the Studio. When the app stops the Studio, it shall take the window off the page and dispose the open workspaces' services.

## Examples

- Given the Studio page in a browser,
  when it loads,
  then it shows the window tabs and Home, as the served Studio.
- Given the Studio page in the desktop app's webview,
  when it loads,
  then it runs as the desktop app.
- Given a user agent with "Macintosh; Intel Mac OS X",
  then `Mod` means ⌘; with "Windows NT 10.0" or "X11; Linux x86_64", it means Ctrl.
- Given a started Studio,
  when the app stops it,
  then the page's element is empty.
