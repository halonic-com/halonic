# studio.src-tauri.phone-screens-commands

- Status: draft
- Since: unreleased
- Source: HAL-16438 (the phone app's Open settings and Open Tailscale buttons, for HAL-15985)

Where the shell runs on Android, it shall let the app's own page open Android's settings page for Halonic through `phone_open_settings`, and the Tailscale app, or its Play Store page when Tailscale isn't installed, through `phone_open_tailscale`, from a local capability for the `main` window only. Neither command shall take anything from the page, and each shall answer only whether the screen opened. While the window isn't on the app's own page, the shell shall open nothing and answer false. No page shall reach the Kotlin plugin's own commands.

## Examples

- Given the window on the app's own page,
  when the page calls `phone_open_settings`,
  then Android's settings page for Halonic opens and the page gets `true`.
- Given a phone without Tailscale,
  when the page calls `phone_open_tailscale`,
  then Tailscale's Play Store page opens and the page gets `true`.
- Given the window moved to `http://192.168.1.20:4280/`,
  when a page calls `phone_open_settings`,
  then nothing opens and the answer is `false`.
- Given the Studio served from `http://192.168.1.20:4280/`,
  when it calls `phone_open_tailscale`,
  then the call is refused as not allowed.
