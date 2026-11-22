# Decision: the phone's own page may open Android's settings for Halonic and the Tailscale app

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16438 (requested by Elena for the HAL-15985 switch-on); Julian, then Liam, review this PR as a security PR
- Kind: internal

The phone's own page gets two new commands, on Android only, from a local capability for the
`main` window (`capabilities/phone-screens.json`): `phone_open_settings` opens Android's settings
page for Halonic, and `phone_open_tailscale` opens the Tailscale app, or its Play Store page when it
isn't installed. They back the phone app's Open settings and Open Tailscale buttons (#5096).

Neither command takes an argument, so the page can't name another screen, app or address: the
Kotlin `PhoneScreensPlugin` opens exactly those intents, and no capability grants its own
commands. Each answers only whether the screen opened, and opens nothing while the window isn't on
the app's own page, the same page check as `tunnel_send`. The barcode-scanner plugin's
`open_app_settings` stays out of reach of every page.

The manifest names Tailscale's package in `<queries>`, so from Android 11 the app can see whether
Tailscale is installed. It names no other app.

`studio.src-tauri.served-page` lists every command the connect page may call, so its Android list
gains these two. The served page is still refused every command.

## Covers

- studio.src-tauri.served-page
- apps/studio/src-tauri/capabilities/phone-screens.json
