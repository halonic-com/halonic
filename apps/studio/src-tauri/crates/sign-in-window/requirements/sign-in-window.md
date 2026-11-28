# studio.src-tauri.crates.sign-in-window.sign-in-window

- Status: draft
- Since: unreleased
- Source: HAL-20515, HAL-20663 (scaled displays, the origin); the board's request on HAL-10 (sign-in links open in a small browser window on top of the Halonic window); the page's side in `studio.desktop-sign-in-window`

When Studio's main window calls `open_sign_in` with an address and the origin of the service it signs in to on Windows and the user's default browser for `https` is Chrome, Edge or Brave, the shell shall start that browser's own program, as its `shell\open\command` names it, with the address as one `--app=` argument, so the page opens as an app window of the user's own browser profile, four fifths of the calling window's size, at least 480 by 560 pixels and at most its monitor's work area, centred on the calling window and kept on that monitor, that size and place given on the command line in device-independent pixels (the physical ones divided by the monitor's scale factor), and answer `opened`. Where the browser was already running and the new window shows elsewhere, the shell shall move the one window that wasn't there before to that place within three seconds, and move nothing when no new window or more than one shows, saying so in its log. When the default browser is any other, or its program isn't an existing `.exe` on a drive, or reading the setting or starting the browser fails, the shell shall start nothing and answer `fallback`, with the reason in its log for a failure. It shall refuse an address that isn't `https`, or plain `http` to this computer, or that holds a user name or password, or whose scheme, host and port aren't exactly the origin's, or when the origin isn't such an address, as `invalid`. On macOS and Linux it shall answer `fallback`. Only Studio's main window shall be granted it, and never the Studio the computer serves.

## Examples

- Given Chrome as the default browser and Studio at 1500 by 1000 pixels on the left of a wide screen,
  when the Paperclip sign-in calls `open_sign_in` with its approval page,
  then a 1200 by 800 Chrome app window shows the page centred on Studio, and the answer is `opened`.
- Given Chrome as the default browser and a display scaled to 150 %, with Studio at 2250 by 1500 physical pixels at 150, 75,
  when the Paperclip sign-in calls `open_sign_in`,
  then Chrome starts with `--window-size=1200,800` and `--window-position=250,150`, so its app window shows centred on Studio.
- Given Chrome already running with a window on the right of the screen,
  when the same call is made,
  then the new app window is moved over Studio, and Chrome's window on the right stays where it is.
- Given Firefox as the default browser,
  when the page calls `open_sign_in`,
  then nothing starts and the answer is `fallback`.
- Given any default browser,
  when the page calls `open_sign_in` with `file:///C:/x.exe` or `http://paperclip.acme.test/`,
  then it is refused as `invalid`.
- Given the origin `https://paperclip.acme.test`,
  when the page calls `open_sign_in` with `https://other.acme.test/cli-auth/challenge-1` or `https://paperclip.acme.test:8443/`,
  then it is refused as `invalid`.
- Given the Studio the computer serves,
  when it calls `open_sign_in`,
  then it is refused as not allowed.
