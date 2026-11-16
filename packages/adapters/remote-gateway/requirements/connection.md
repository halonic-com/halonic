# remote-gateway.connection

- Status: active
- Since: 0.2.0
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5685

The remote gateway shall keep the rules of `ports.remote-gateway-protocol` for each connection, handling one frame at a time in the order it arrived. It shall reach the host only through a session source that offers sessions, their events, approvals and prompts, so a remote prompt or answer takes the same road, trust gate and sandbox as a local one and nothing in it can run a command, touch a file or read a secret. It shall answer `hello` with `welcome`; close with `malformed` on any message before `hello` and on a second one; close with `unsupported-version` on another version; and close on a frame it can't read, as `ports.remote-gateway-protocol` lists. It shall say `ok` to a `watch` before the first event, then send the events in order; replace a second watch of a session; refuse the 17th session with `too-many-watches`; answer `history-gone` when the events are gone, and close the connection when events a watch hadn't been given are dropped mid-stream, so the phone's resume gets that answer; and stop every watch when the connection closes. It shall shorten a `message` text that makes its event larger than 64 KiB, ending it with "…", and close the connection rather than skip an event it can't make fit. It shall close a connection with more than 1 MiB unsent. It shall pass an answer to an approval on only when the host says the approval is waiting, and refuse an answer to a `risky` one with `not-allowed-remotely` unless the person allowed it on the desktop. When the source fails, it shall close the connection and say nothing of why.

## Examples

- Given a connection that hasn't said `hello`,
  when the phone sends `list-sessions`,
  then the host sends `malformed` and closes.
- Given a session with events 1 and 2 and a new event 3 coming,
  when the phone watches from 1,
  then it gets `ok`, then events 2 and 3.
- Given 16 watched sessions,
  when the phone watches a 17th,
  then it gets `too-many-watches` and the connection stays open; watching one of the 16 again is allowed.
- Given a message event whose text is 40,000 emoji,
  when it is sent,
  then the text is shortened, ends with "…", and the event fits in 64 KiB without a broken character.
- Given a risky approval and no permission on the desktop,
  when the phone answers it,
  then it gets `not-allowed-remotely` and the session hears nothing.
- Given an approval that is settled between the check and the answer,
  when the phone answers it,
  then it gets `unknown-approval`.
- Given a phone that leaves more than 1 MiB unsent,
  when the next event is sent,
  then the connection closes and its watches stop.
