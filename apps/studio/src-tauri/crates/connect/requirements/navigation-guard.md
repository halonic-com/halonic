# studio.src-tauri.crates.connect.navigation-guard

- Status: draft
- Since: 0.1.0
- Source: HAL-1137, HAL-1375, HAL-1576 (flow-install-update 5.4)

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
- Given the confirmed address `192.168.1.20:4280`,
  when a form sent with POST loads `http://192.168.1.21:4280/` in the window,
  then the window goes back to the connect screen.

## Limits

- **Redirects and POST.** On WebKitGTK the guard is asked about every
  navigation, server redirects (301, 302, 303, 307, 308) and POST included.
  Android WebView asks it about links and GET redirects, but never about a
  POST, so a form sent with POST, or a 307 or 308 redirect of one, loads
  without the guard. For these the shell checks every page as it starts and
  as it finishes loading, and takes the window back to the connect screen
  when the page isn't the confirmed address. Such a page may run for a moment
  first. It gets no commands, because the served page has no capability.
- **Names are looked up again.** The guard compares the host as typed. When
  that is a name, such as `my-laptop.local`, the window does its own DNS
  lookup, which can answer with a different IP than the one Connect checked.
  The window keeps the name on purpose: an `https://` certificate is issued
  for the name, the server's planned host allow-list (threat model, phase 4)
  expects it, and the sign-in session belongs to it. A device that can answer
  for the name can also pass the connect check, so loading the checked IP
  would add little. What such a device gains is a page in the app window
  instead of the browser, with no commands. To rule it out, connect with the
  computer's IP address, or with `https://` and a valid certificate.
