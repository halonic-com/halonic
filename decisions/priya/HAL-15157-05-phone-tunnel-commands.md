# Decision: the phone's own page gets the phone tunnel's commands, and their events reach only that page

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15157 (tunnel D6, decided on HAL-15151; H1 from Julian's D7 review on HAL-15181); Julian, then Liam, review this PR as a security PR
- Kind: internal

The phone's own page gets eight new commands, on Android only, from a local capability for the
`main` window (`capabilities/phone-tunnel.json`): `phone_pair_start`, `phone_pair_wait`,
`phone_pair_cancel`, `phone_computers`, `phone_forget`, `phone_connect`, `phone_disconnect` and
`phone_tunnel_watch`. The `halonic-phone-tunnel` crate does the work, and every key stays in Rust:
the page gets only check codes, computer names, ids, endpoints, times and states, as typed shapes.

`studio.src-tauri.served-page` lists every command the connect page may call (HAL-14236), so its
Android list gains these eight. Nothing else in it changes, and the served page is still refused
every command (`served_page_tests.rs` checks the new ones too).

The phone tunnel's events (statuses now, D7's session events later) go to the page on the channel
it hands to `phone_tunnel_watch`, and only while the window is on the app's own page: a watch from
any other page is refused, the navigation guard drops the channel when it lets the window leave
the app's own page, every page load drops it, and each event checks the window's page again
before it is sent. The served Studio, which the address path loads into the same window, never
gets one (H1).

The shell asks Android for the phone's name, for pairing message 3, through a new Kotlin
`PhoneNamePlugin` that no capability grants.

## Covers

- studio.src-tauri.served-page
- apps/studio/src-tauri/capabilities/phone-tunnel.json
