# remote.phone-host-messages

- Status: draft
- Since: unreleased
- Source: HAL-15179 (tunnel D7, design on HAL-15159, section 5 item 10, Julian's finding L2 on HAL-15181)

The phone shall read each message from the computer's remote gateway strictly, with one function, before it acts on it. It shall check the size first, before it parses anything, and refuse a message over 65,519 bytes of UTF-8 as `too-large`. It shall refuse as `malformed` text that isn't exactly one JSON object (a byte order mark included), a `type` the protocol doesn't list for the version the phone speaks (a property every object has included), and a missing, extra or wrongly typed field, in the message, in each listed session, and in an event's body and its approval. Ids shall follow the protocol's id rule, an event's `seq` shall be a whole number from 1, and an `error` shall be either a closing one without `replyTo` or a refusal with one, never a mix. It shall refuse a `welcome` from a host of another protocol version as `other-version`, whatever else it holds. Any refusal ends the session.

## Examples

- Given a valid message of each type the host may send,
  when the phone reads it,
  then it comes back unchanged.
- Given a message of 65,519 bytes and one of 65,520 bytes, counted in UTF-8,
  when the phone reads them,
  then the first is read and the second is `too-large`.
- Given `[]`, `null`, two objects in a row, or a byte order mark before a valid message,
  when the phone reads them,
  then each is `malformed`.
- Given the types `run-command`, `toString` and `__proto__`,
  when the phone reads a message of that type,
  then it is `malformed`.
- Given an event with an extra field, a session list with a session missing its title, or an approval with a `risk` of `low`,
  when the phone reads it,
  then it is `malformed`.
- Given a closing `error` with a `replyTo`, or a refusal without one,
  when the phone reads it,
  then it is `malformed`.
- Given a `welcome` of version 3,
  when the phone reads it,
  then it is `other-version`.
