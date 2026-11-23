# studio.connect.phone-tunnel-messages

- Status: draft
- Since: unreleased
- Source: HAL-15177 (D7a); the D7 design on HAL-15159, section 1; the `ComputerTunnel` port (HAL-15239) and Liam's review of #4947 (HAL-15179)

When the gateway client in the Android app sends or reads messages for one paired computer, the page shall use the shell's `tunnel_send` and `tunnel_end_session` commands for that computer, and shall read that computer's statuses, opened sessions and host messages from the same one `phone_tunnel_watch` channel the screens use. The page shall pass each host message's text on unread. It shall read each status as the header label's state, and shall pass on no event for `paused` or `closed`. A new subscriber shall first get the computer's latest status and, if a session is open, its `session-opened`. A send shall never reject: the shell's refusal shall reach the client as the port's typed reason, and an answer the page doesn't know, or a command the shell refuses, shall read as `not-open`. No message text shall reach the page's report.

## Examples

- Given the shell sends `{"kind":"message","computer":"c1","generation":3,"text":"{\"type\":\"welcome\"}"}`,
  when the client for `c1` is told,
  then it gets `{"kind":"message","generation":3,"text":"{\"type\":\"welcome\"}"}`, and the client for `c2` gets nothing.
- Given the shell answers `{"sent":false,"reason":"too-large"}` to `tunnel_send`,
  when the client sent a message,
  then its send resolves `{"sent":false,"reason":"too-large"}`.
- Given the shell refuses the `tunnel_send` command itself,
  when the client sent a message,
  then its send resolves `{"sent":false,"reason":"not-open"}` and the report holds none of the text.
- Given a session 3 is open on `c1`,
  when a client for `c1` subscribes,
  then it gets the latest status and then `{"kind":"session-opened","generation":3}`.
