# remote-gateway.message-parser

- Status: active
- Since: unreleased
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; tasks HAL-5685 and HAL-5684

The remote gateway shall read each frame from a phone with one function, `parseGatewayClientMessage`, which the attack suite's fuzzer shall use too, so the host and the fuzzer can't disagree on what a valid message is. It shall check the size first, before it decodes or parses anything, and answer `too-large` for a frame over 64 KiB. It shall answer `malformed` for a binary frame, bytes that aren't valid UTF-8, text that starts with a byte order mark (it reads a message strictly), text that isn't one JSON object, a `type` that isn't one of the six a phone may send (a property every object has included), a missing, extra or wrongly typed field, an id that breaks the id rule, an `afterSeq` that isn't a whole number from 0 up, and a prompt that is empty or longer than 10,000 code units. It shall not check what depends on the connection's state (a message before `hello`, a version other than 1, an `afterSeq` above a session's `lastSeq`): that is the connection's.

## Examples

- Given a valid message of each of the six types,
  when it is parsed,
  then it comes back unchanged.
- Given a frame of 64 KiB plus one byte,
  when it is parsed,
  then the answer is `too-large`.
- Given a binary frame, invalid UTF-8, a byte order mark before a valid message, `[]`, `null` or two objects in a row,
  when they are parsed,
  then each is `malformed`.
- Given the types `run-command`, `read-secret`, `toString` and `__proto__`,
  when a message of that type is parsed,
  then it is `malformed`.
- Given a watch with an extra field, a missing field or a string for `afterSeq`,
  when it is parsed,
  then it is `malformed`.
- Given an id of 129 characters, or one with a space, a slash or a non-ASCII letter,
  when a message with it is parsed,
  then it is `malformed`; an id of 128 characters is accepted.
- Given a prompt of 10,000 code units, one of 10,001, and an empty one,
  when they are parsed,
  then the first is accepted and the others are `malformed`.
