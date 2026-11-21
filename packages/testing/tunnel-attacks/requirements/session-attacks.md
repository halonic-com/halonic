# tunnel-attacks.session-attacks

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 1–4 (HAL-12232); task HAL-12238; ADR "Pairing and the end-to-end session"; attack cases B1, B8, B11 and B12

When a client connects through a tunnel, the remote gateway shall let it do nothing that its end-to-end session doesn't allow: a phone that isn't paired shall learn so only from an encrypted `not-paired` after the host's message 2, a replayed handshake or message and a reordered message shall get no further than closing, a protocol message in the clear shall get no answer at all, and a phone that pinned another host key shall get only a cleartext `handshake-failed`. None of these shall ask the host for anything.

## Examples

- Given a phone that isn't paired,
  when it reconnects through the tunnel,
  then it reads the host's message 2 and then an encrypted `not-paired`, and the host closes.
- Given a paired phone's reconnect message 1 and sealed `hello`, captured,
  when they are sent again on a new connection,
  then the host answers message 2, closes on the `hello`, and is asked for nothing.
- Given a paired phone in its session,
  when two messages arrive in the wrong order, or one sealed message arrives twice,
  then the host closes, and acts on a repeated message at most once.
- Given a `hello` in a text frame, in a bare binary frame or under the message kind without a session, or in a text frame after the handshake,
  when it is sent,
  then the host closes and sends no cleartext frame and no message; before the handshake it sends no binary frame at all.
- Given a phone that pinned another host key,
  when it reconnects,
  then the host sends one cleartext `handshake-failed` and closes.
