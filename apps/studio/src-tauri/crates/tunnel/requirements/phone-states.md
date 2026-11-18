# studio.src-tauri.crates.tunnel.phone-states

- Status: draft
- Since: unreleased
- Source: HAL-12244; tunnel phase B build plan, decisions 3 and 4 (HAL-12232); design decision 16 (HAL-12206); ADR "Pairing and the end-to-end session"

For a paired computer, the phone shall run the reconnect handshake to the pinned host key on every connection that opens, and shall drop a connection whose handshake hasn't finished within 10 seconds. It shall work out its state only from what it can see: when the first try fails, it shall say whether its own network was down, the try timed out, the computer refused it or the computer was unreachable; after a drop it shall be reconnecting, with the reason of the last failed try. When the host sends `handshake-failed` or reconnect message 2 doesn't decrypt, it shall be "Can't confirm" until a handshake succeeds, keep trying, and clear nothing. It shall be Removed only when `not-paired` arrives inside a session whose handshake proved the host, and then it shall stop. It shall be connected once the host answers `welcome`.

## Examples

- Given a host that completes the handshake and answers `welcome`,
  when the phone connects,
  then it is connected.
- Given a host that completes the handshake and then sends `not-paired`,
  when it arrives,
  then the phone is Removed and stops.
- Given someone on the path who sends a `not-paired` that isn't encrypted,
  when it arrives,
  then the phone is reconnecting, never Removed.
- Given a host that answers `handshake-failed`,
  when the phone reconnects and a later handshake succeeds,
  then it was "Can't confirm" in between and is connecting after.
- Given a host that never answers the handshake,
  when the time limit passes,
  then the phone drops the connection and reconnects.
