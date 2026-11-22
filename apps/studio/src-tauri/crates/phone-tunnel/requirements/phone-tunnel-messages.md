# studio.src-tauri.crates.phone-tunnel.phone-tunnel-messages

- Status: draft
- Since: unreleased
- Source: HAL-15177 (D7a); the D7 design on HAL-15159, section 1 and B7 items 1, 2, 6, 7 and 12, with Julian's L1 and M4 from HAL-15181; the `ComputerTunnel` port (HAL-15239)

When a session to a paired computer opens, the phone shall tell the page, under a generation that goes up for every session in the process, across all computers, and is never given again. It shall pass each host message of that session on as text, in order. A host message that isn't UTF-8 text shall end its session.

When the page sends a message, the phone shall seal it only into the session of the computer and generation the page names, and only while that session is open. It shall refuse, and send nothing, in this order: when no session of that generation is open on that computer (before the handshake has finished, after a reconnect, for another computer, after a disconnect, Removed or Forget), `not-open`; when the text is more than 65,519 bytes of UTF-8, counted before any parsing, `too-large`; when it isn't exactly one JSON object, with nothing after it and one `type` key, whose `type` is one of the six messages a phone sends, `not-allowed`. It shall read nothing of the message but its `type`. A refusal shall leave the session open. It shall never queue a message or send one again.

When the page ends the open session of a generation, the phone shall drop that connection and reconnect after its backoff, without the time the session lasted starting the backoff again; for any other generation it shall do nothing. No message text shall reach the log.

## Examples

- Given a connection whose reconnect handshake hasn't finished,
  when the page sends `hello`,
  then it is refused with `not-open`, and the computer's first frame after the handshake is the next message the page sends.
- Given an open session,
  when the page sends a prompt,
  then no frame the computer reads holds the prompt's text, and the frame decrypts to it.
- Given an open session of generation 3 on the desk,
  when the page sends a `run-command`, two objects, a duplicate `type`, a 65,520-byte prompt, or a `hello` for generation 4 or for the laptop,
  then each is refused, nothing goes out, and the next `hello` for generation 3 does.
- Given a prompt that went out just before the connection dropped,
  when the phone reconnects and the page sends another,
  then the computer reads the first prompt once and the second as the new session's first message.
- Given an open session,
  when the page ends it,
  then the phone reconnects after its backoff, and the page hears of a session with a higher generation.
