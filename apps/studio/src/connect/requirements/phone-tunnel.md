# studio.connect.phone-tunnel

- Status: draft
- Since: unreleased
- Source: HAL-15157 (tunnel D6; port shape agreed with D5 on HAL-15166 and HAL-15712); HAL-16823 (the `nearby` start, agreed on HAL-16829)

When the phone's own page uses the phone tunnel in the Android app, the page shall call only the shell's `phone_*` commands and `phone_tunnel_watch`, and shall hand over no more than the pairing code, the scanned QR code's host key and the computer's endpoints, or the id of a computer the picker found on this Wi-Fi (HAL-16824). The page shall read each answer into the `PhoneTunnel` port's typed kinds, never a raw message: `denied` as `refused`, `timed-out` as `timeout`, `not-paired` from a start as `bad-start`, a listed computer whose details can't be read as an unreadable computer, and `nextTryAtMs` as the ISO time `nextTryAt`. If an answer isn't one the page knows, then the page shall report it and read it as that call's safest outcome. A wait or a cancel for a pairing that a newer start replaced shall not reach the shell. The page shall watch statuses on one channel, opened for the first listener and kept until the page loads again, and a later listener shall get each computer's latest status first.
## Examples

- Given a scanned pairing code,
  when the page starts the pairing,
  then the shell gets the route `qr`, the host key as base64url, the code and the endpoints, and not the scanned text.
- Given a typed code for a computer the picker found,
  when the page starts the pairing,
  then the shell gets the route `nearby`, the code and the computer's id, and no address.
- Given the shell answers `{"kind":"denied"}` to the wait,
  when the page reads it,
  then it gets `refused`.
- Given two pairings started one after the other,
  when the screen cancels the first,
  then nothing is sent to the shell.
- Given the shell sends `{"kind":"status","computer":"c1","status":{"state":"reconnecting","nextTryAtMs":500}}`,
  when a listener is told,
  then it gets `nextTryAt` `1970-01-01T00:00:00.500Z`.
- Given a listener that stopped listening,
  when another listener starts,
  then the page doesn't call `phone_tunnel_watch` again.
