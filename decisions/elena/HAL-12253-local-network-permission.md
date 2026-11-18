# Decision: ask for Android 17's local network permission before Connect

- Task: HAL-12253
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12253 (Priya asked for the permission, the request before a private address only and a clear denied state; Liam reviews the native command in the security review)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nZeiJBne4jcNZVNhQASZAc7YT3zqGBcOls+uO/Sfp5sTDWeLFLE6cBcaSRXuSrFdSJKzULyDeyTrR2wbiZpsBQ==

## What changes

- The Android manifest declares `ACCESS_LOCAL_NETWORK`. A small Kotlin plugin
  (`LocalNetworkPlugin`) asks for it; only Rust's `connect` calls it, no capability grants it to
  a page, and `served_page_tests.rs` checks that.
- `connect` asks before a `.local` lookup, and before the hello call when the address resolves
  to a private, non-loopback address. Public addresses, `localhost` and Tailscale `100.x` never
  ask. On Android 16 or older the plugin answers "allowed" with no prompt.
- The connect result gains one value, `noLocalNetwork` (`connect-result.schema.json`, the
  `connect-result` requirement and the new `studio.src-tauri.crates.connect.local-network` requirement). The connect
  page shows it as a field error under Address, so the requirement
  `studio.connect.field-errors` gains that row. No existing value or row changes.

## Why

An app that targets SDK 37 is blocked from the local network on Android 17 unless the user
grants this permission, so Connect to a computer on the Wi-Fi timed out with "isn't answering".
A distinct result lets the page say what to do instead. WebView traffic inherits the app's
permission, so the same grant also lets the served Studio load.

The field error text is on the approved connect screen; Sofia settles the final wording on
HAL-12260 together with the pairing picker's prompt.

No test was weakened or removed.

## Covers

- studio.connect.field-errors
- apps/studio/src-tauri/crates/connect/spec/connect-result.schema.json
