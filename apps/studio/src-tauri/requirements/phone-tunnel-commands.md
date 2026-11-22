# studio.src-tauri.phone-tunnel-commands

- Status: draft
- Since: unreleased
- Source: HAL-15157 (D6) rules 1 to 4; H1 and L3 of Julian's D7 review on HAL-15181 (the D7 note on HAL-15159, section 1); HAL-15177 (D7a: `tunnel_send`, `tunnel_end_session` and the session events)

Where the shell runs on Android, it shall let the app's own page pair with a computer, list, forget, connect to and disconnect from paired computers, and watch their statuses, through `phone_pair_start`, `phone_pair_wait`, `phone_pair_cancel`, `phone_computers`, `phone_forget`, `phone_connect`, `phone_disconnect` and `phone_tunnel_watch`, and send gateway messages into a computer's session and end one through `tunnel_send` and `tunnel_end_session`, from a local capability for the `main` window only. Every answer and event shall be a typed shape with no private key, session key, pairing code or psk in it. The shell shall send the phone tunnel's events only while the window is on the app's own page: it shall refuse a watch from any other page, drop the page's channel when the navigation guard lets the window leave the app's own page and whenever a page starts loading, and check the window's page again before each event, dropping the channel when the window is anywhere else. A page that watches shall get each computer's current status first, then each open session. The phone tunnel's events shall be a computer's status, a session that opened with its generation, and a host message of a session with its text; `tunnel_send` shall also answer `not-open` while the window isn't on the app's own page. A page that starts loading shall also end the pairing in progress.

## Examples

- Given the window on the app's own page and a page that watches,
  when a computer's status changes,
  then the page gets the current status first and then the change.
- Given the window moved to `http://192.168.1.20:4280/`,
  when a computer's status changes,
  then nothing is sent and the channel is dropped, and it stays dropped back on the app's own page.
- Given the guard letting the window go to the confirmed address,
  when a status changes before the served page has loaded,
  then nothing is sent.
- Given the window on `http://192.168.1.20:4280/`,
  when a page asks to watch,
  then the watch is refused and nothing is sent.
- Given the window moved to `http://192.168.1.20:4280/`,
  when a session opens or a host message arrives,
  then nothing is sent, as for a status.
- Given a page that watches while a session of generation 7 is open,
  when the watch starts,
  then the page gets the statuses, then `{ "kind": "session-opened", "computer": "desk", "generation": 7 }`.
