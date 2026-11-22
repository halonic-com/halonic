# tunnel-attacks.paired-phone-attacks

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 3, 4 and 10 and the B7 row (HAL-12232); task HAL-12242; the revoke between message 2 and the first message from the review on HAL-14100; ADR "Pairing and the end-to-end session"; attack cases B6 and B12

When a phone paired through the host's own Pair a phone dialog reconnects through a tunnel, the host shall tell a revoked phone only an encrypted `not-paired`, after its message 2: at once on a session that is open when the phone is revoked, when it reconnects, and when it is revoked between the host's message 2 and its first message, which shall never make it connected or reach the host's sessions. A reconnect to another host key shall end with one cleartext `handshake-failed` and change nothing the host keeps, so the phone still reconnects with the right key. The paired phones file shall hold the phones' public data only, and no byte of the phone's or the host's private key, raw or written as text.

## Examples

- Given a paired phone in its session,
  when it is revoked,
  then it reads `not-paired` inside the session and the host closes; when it reconnects, it reads message 2 and then `not-paired`, encrypted.
- Given a paired phone that has read the host's message 2,
  when it is revoked before its `hello`,
  then the `hello` gets an encrypted `not-paired`, the host closes, and its sessions are asked nothing.
- Given a paired phone,
  when it reconnects to another host key,
  then it gets one cleartext `handshake-failed`, the paired phones file is unchanged, and its next reconnect with the right key is welcomed.
- Given a paired phone that had a session,
  when the paired phones file is read,
  then it holds the id, public key, name, platform, paired at and last seen, and neither private key in raw bytes, hex, base64 or base64url.
