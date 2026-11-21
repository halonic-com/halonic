# studio.src-tauri.crates.tunnel.reconnect-next-try

- Status: draft
- Since: unreleased
- Source: HAL-15157 (D6); the `PhoneTunnel` port agreed with Elena on HAL-15166 ("Trying again in N seconds" and "Try now")

While the phone is reconnecting to a paired computer, it shall say how long it waits before its next try, after the drop and after each failed try. When the person asks it to try now, it shall end that wait and try at once, and the backoff shall go on from where it was. Asking to try now shall change nothing while a connection is open, or while the phone is paused.

## Examples

- Given a transport whose computer has gone,
  when it reconnects,
  then before each try it says how long it waits: 500 ms, then about 1 s, then about 2 s, each ±20 %.
- Given a phone that waits a minute before its next try,
  when the person asks it to try now,
  then it connects at once and runs a new handshake.
- Given an open connection,
  when the person asks to try now,
  then the same connection stays open and no new one is made.
