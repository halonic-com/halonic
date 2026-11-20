# remote-gateway.e2e-session

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 1–4, 8 and 9 (HAL-12232); task HAL-12238; ADR "Pairing and the end-to-end session"

The remote gateway shall run each phone's connection inside the end-to-end session of `ports.remote-gateway-session`, through the Noise adapter, and read or send no gateway message outside a Noise transport message. The only cleartext it sends shall be `handshake-failed` and `pair-refused`, after which it closes.

**Pairing.** On pairing message 1 it shall ask the host's pairing service for the open code and, when there is none, send `pair-refused` with the service's reason before any message 2. It shall answer message 1 with message 2 carrying the host's name, and send nothing and count no try when message 1 can't be read. It shall decrypt message 3 with the code, recompute the phone's commitment from message 1 and compare it in constant time, and check the payload; when any of these fails, or the connection ends after message 2 and before message 3 decrypts, it shall report one wrong try and send the service's `pair-refused`. Once message 3 decrypts and matches, it shall give the pairing service the phone's key, name, platform and check code, and send `paired` when the person allows it, an encrypted `pair-refused` with `denied` or `timed-out` otherwise, and close on any frame from the phone before then. When the phone leaves while the person decides, it shall tell the service.

**Reconnecting.** On reconnect message 1 it shall send `handshake-failed` and close when the message doesn't decrypt to the host's key, and answer message 2 when it does. Only after message 2 shall it send an encrypted `not-paired` and close, when the phone's key isn't paired. It shall count a phone as connected only once its first transport message decrypts, never on message 1, and send an encrypted `not-paired` and close when the phone is revoked while connected.

**Limits.** It shall close a connection whose handshake hasn't ended 10 seconds after it started, an open session without `hello` after the hello time, and every session 24 hours after it opened. It shall close on a frame of an unknown kind, of a kind the state doesn't take, or a handshake message over 1,024 bytes. It shall send a `rekey` frame and rekey its sending direction before its 10,001st message under one key and once 30 minutes have passed, rekey its receiving direction on each `rekey` frame, and close when a 10,001st message arrives without one. Closing shall wipe the session's keys.

## Examples

- Given an open code,
  when a phone pairs, the check codes match and the person allows it,
  then the phone reads `paired`, its `hello` gets `welcome`, and it counts as connected.
- Given an open code,
  when a phone's message 3 was made with another code,
  then the host counts one wrong try, sends `pair-refused` with `wrong-code` in cleartext and closes.
- Given an open code,
  when a phone's message 3 differs from the one it committed to,
  then that is a wrong try.
- Given a pairing the host answered with message 2,
  when the phone hangs up,
  then that is a wrong try.
- Given no open code,
  when a phone sends pairing message 1,
  then the host sends `pair-refused` with `code-ended` and no message 2.
- Given a pairing waiting for Allow,
  when the person presses Don't allow,
  then the phone reads an encrypted `pair-refused` with `denied`.
- Given a paired phone,
  when it reconnects and says `hello`,
  then it gets `welcome`, and it counted as connected only once `hello` decrypted.
- Given a phone that isn't paired,
  when it reconnects,
  then it reads message 2 and then an encrypted `not-paired`, and the host closes.
- Given a phone that pinned another host key,
  when it reconnects,
  then the host sends `handshake-failed` in cleartext and no message 2.
- Given a gateway message sent before any handshake,
  when the host reads it,
  then it closes and sends nothing.
- Given a paired phone that is connected,
  when it is revoked,
  then it reads an encrypted `not-paired` and the host closes.
- Given a session that sent 10,000 messages under one key,
  when it sends one more,
  then a `rekey` frame goes first and the phone reads both.
