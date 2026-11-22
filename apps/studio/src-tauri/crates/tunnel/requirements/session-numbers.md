# studio.src-tauri.crates.tunnel.session-numbers

- Status: draft
- Since: unreleased
- Source: HAL-15177 (D7a); the D7 design on HAL-15159, section 1 and Julian's L1 (a message built before a reconnect never goes out); the `ComputerTunnel` port's `endSession` (HAL-15239)

The phone connection shall number its sessions from 1 and never give a number again. It shall seal a message only into the session the app names, and only while that session is open; a message for any other session shall be refused, and nothing shall be sent. When the app ends the open session, because it refuses what the host sent in it, the phone shall drop that connection and reconnect after its backoff, which shall go on from where it was however long the session lasted. Ending a session that isn't the open one shall do nothing.

## Examples

- Given a phone whose first session dropped and whose second is open,
  when the app sends a message into session 1,
  then it is refused, and the host's first frame of session 2 is the next message sent into session 2.
- Given an open session 1,
  when the app ends session 2,
  then session 1 stays open and its messages still go out.
- Given a backoff that starts again after any time open,
  when the app ends two sessions in a row,
  then the phone waits 40 ms, then 80 ms, as after two failed tries.
