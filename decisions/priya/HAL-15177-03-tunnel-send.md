# Decision: the phone's own page sends gateway messages through the shell, and gets the session's messages only there

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15177 (tunnel D7a; the D7 note on HAL-15159, signed by Julian and Liam, section 1 and B7 items 8 and 9; H1, L1 and L3 from Julian's review on HAL-15181); Julian, then Liam, review this PR as a security PR
- Kind: internal

The phone's own page gets two new commands, on Android only, from the same local capability for
the `main` window as D6's (`capabilities/phone-tunnel.json`):

- `tunnel_send(computer, generation, text)` seals one gateway message into the computer's open
  session of that generation and sends it, or answers `{ sent: false, reason }` with `not-open`,
  `too-large` or `not-allowed`. The `halonic-phone-tunnel` crate makes the checks (L1) before
  anything is sealed, and nothing is queued or tried again. The command also answers `not-open`
  while the window isn't on the app's own page.
- `tunnel_end_session(computer, generation)` drops a session the page refused a host message on.
  The phone reconnects after its backoff, which doesn't start again. A stale generation does
  nothing.

The session's events take the channel D6's statuses already use: `{ kind: "session-opened",
computer, generation }` and `{ kind: "message", computer, generation, text }`. So they get the same
H1 rules: sent only while the window is on the app's own page, the channel dropped when the window
leaves or a page loads, and the window's page checked again before each event. The served Studio
never gets a message's text. A page that watches gets each open session after the statuses, so it
can send `hello` on it.

The page sees message text and generations, never a key, a psk or a session key (B7 item 9).
`studio.src-tauri.served-page` lists every command the connect page may call, so its Android
list gains these two. Nothing else in it changes, and `served_page_tests.rs` checks that the
served page is refused both, and gets no session event.

## Covers

- studio.src-tauri.served-page
- apps/studio/src-tauri/capabilities/phone-tunnel.json
