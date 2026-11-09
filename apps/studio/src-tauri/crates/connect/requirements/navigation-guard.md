# studio.src-tauri.crates.connect.navigation-guard

- Status: draft
- Since: 0.1.0
- Source: HAL-1137, HAL-1375 (flow-install-update 5.4)

While the app window navigates, the navigation guard shall let only the app's own connect page and the address the last Connect confirmed (same scheme, host and port) load in the window. When the target is `halonic-app://connect`, the guard shall cancel it and open the connect screen with the address filled in. If the target is any other `http://` or `https://` page, then the guard shall cancel it and open it in the phone's browser; if it is anything else, then the guard shall cancel it.

## Examples

- Given the confirmed address `192.168.1.20:4280`,
  when the window goes to `http://192.168.1.20:4280/settings`,
  then it loads in the window; `http://192.168.1.20:4281/` opens in the browser.
- Given the served About page,
  when Change address (`halonic-app://connect`) is pressed,
  then the connect screen opens with the address filled in.
- Given a `javascript:` or `intent:` link,
  when it is followed,
  then nothing happens.
