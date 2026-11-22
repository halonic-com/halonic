# studio.src-tauri.crates.phone-tunnel.phone-tunnel-pairing

- Status: draft
- Since: unreleased
- Source: HAL-15157 (D6); the `PhoneTunnel` port agreed with Elena on HAL-15166; Liam and Julian on HAL-15208 (the wait for Allow starts at message 3)

When the phone's own page starts a pairing, the phone shall check the code, the QR code's host key and the endpoints again, ask Android's local network question before it reaches an address on the Wi-Fi, end any pairing already in progress, and answer the computer's name and the check code, or why the pairing stopped as a typed problem. It shall wait for the computer's Allow from the moment message 3 is sent. When the computer allows the phone, the phone shall keep the computer with the phone's new key in its paired-computer list and answer the listed computer; paired again, the computer shall keep its id, and a connection to it under the earlier key shall end; when the person cancels, it shall close the connection and a waiting call shall answer `code-ended`. No answer shall hold a private key, a session key, the pairing code or its psk.

## Examples

- Given a computer that presses Allow,
  when the phone pairs with a typed code,
  then it answers the computer's check code, and then the listed computer with the phone's key kept.
- Given a QR code from another computer,
  when the phone pairs,
  then it answers `handshake-failed` and the connection ends with no message 3.
- Given a typed code the computer doesn't have,
  when the phone waits for Allow,
  then it answers `wrong-code` with 4 tries left and lists nothing.
- Given a pairing at its check code,
  when the person leaves the screen,
  then the wait answers `code-ended` and the computer sees the connection close.
- Given an address on the Wi-Fi and a person who turned the local network permission down,
  when the phone pairs,
  then it answers `no-local-network` and reaches nothing.
- Given a connected computer set up again with a new key,
  when the person chooses Pair again on it and the computer allows the phone,
  then it keeps its id, the connection under the earlier key ends, and it is listed once.
