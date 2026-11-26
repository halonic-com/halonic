# Decision: the phone's own page reads, writes and clears its saved Inbox and Messenger through the shell

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19026 (phase 2 G3b shell, the architecture note on HAL-17511, section 2.4); Liam reviews this PR as a security PR, with Julian's check of the store's encryption
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4BT/rT0W3/ZLdjh2y5YsAEG3i+XeWZ8dG8aOJo3KaL6um4r9RrpAWJ9hhu5ASKh9RNqwbuzf3wVo+0Of+T/ZAA==

The phone's own page gets three new commands, on Android only, from the same local capability for
the `main` window as the phone tunnel's (`capabilities/phone-tunnel.json`):

- `phone_saved_read(computer)` answers the text saved for that computer, or `null`.
- `phone_saved_write(computer, text)` replaces it; text over 20 MB is refused with `too-large`.
- `phone_saved_clear(computer)` deletes it.

Each one answers only while the window is on the app's own page, as `tunnel_send` does, so the
Studio a computer serves into the same window can't read the saved text even if it got the
permission. The shell seals the text with the Android Keystore key that already seals the device
keys, under its own context (`halonic saved text v1:<computer>`), so a sealed key can't be read as
saved text, nor text from one computer's file as another's. The shell deletes a computer's file
itself on Forget and on Removed, so the text goes even when the page isn't there to ask.

`studio.src-tauri.served-page` lists every command the connect page may call, so its Android
list gains these three. Nothing else in it changes, and `served_page_tests/phone_tunnel.rs` checks
that the served page is refused all three and that the capability grants exactly them besides the
tunnel's.

## Covers

- studio.src-tauri.served-page
- apps/studio/src-tauri/capabilities/phone-tunnel.json
