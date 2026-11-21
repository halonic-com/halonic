# studio.src-tauri.crates.tunnel.gateway-interop

- Status: draft
- Since: unreleased
- Source: HAL-12244; tunnel phase B build plan (HAL-12232), D1's interop test against the host from B3 (HAL-12238); ADR "Pairing and the end-to-end session"

The phone's end of the end-to-end session shall work against the computer's real remote gateway (`@halonicjs/adapter-remote-gateway`), over a WebSocket on loopback, with no part of either side replaced. It shall pair from a QR code and from a typed code, and both sides shall show the same check code. A paired phone shall reconnect, say `hello` inside the session and be connected on the host's `welcome`. It shall be Removed when the host revokes it, "Can't confirm" when the host's key isn't the one it pinned, and told the tries left when its code is wrong.

## Examples

- Given the real gateway with an open code,
  when the phone pairs from a QR code with the host's key,
  then the host answers `paired`, both sides have the same check code, and `hello` gets `welcome` inside the session.
- Given a phone that paired from a typed code,
  when it reconnects twice,
  then each time the host answers `welcome` and the phone is connected.
- Given a connected phone,
  when the host revokes it,
  then the phone is Removed.
- Given a phone that pinned another host key,
  when it reconnects,
  then it is "Can't confirm".
- Given a well-formed code that isn't the open one,
  when the phone sends pairing message 3,
  then the host refuses it as a wrong code with 4 tries left.
