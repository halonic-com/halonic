# ports.remote-gateway-protocol

- Status: active
- Since: unreleased
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5684. Version 2: tunnel phase B, task HAL-12235, ADR "Pairing and the end-to-end session"

The remote gateway protocol (version 2) shall carry only sessions, their events, approvals, prompt input and the end of a pairing, and every message shall run inside the end-to-end session (`ports.remote-gateway-session`), never in cleartext. A phone shall send `hello`, `list-sessions`, `watch`, `unwatch`, `answer-approval` and `prompt`, and nothing else; the host shall send `welcome`, `sessions`, `event`, `ok`, `error`, `paired`, `pair-refused` and `not-paired`.

**Pairing and reconnecting.** At the end of a pairing the host shall send `paired` once the person pressed Allow, or `pair-refused` with `denied` or `timed-out` and close. After a reconnect the host shall send `not-paired` and close when it doesn't know the phone's key, only after its handshake message has proved who it is; it shall also send it at once to a phone revoked while connected. The phone's first message after `paired`, or after a reconnect the host accepts, shall be `hello`.

**Limits.** No message shall be larger than 65,519 bytes of UTF-8 JSON (one Noise transport message less its tag), checked before parsing. No prompt shall be empty or longer than 10,000 code units, so a valid prompt fits even when every unit takes six bytes in JSON. Every id shall be 1 to 128 characters from `A`–`Z`, `a`–`z`, `0`–`9`, `_` and `-`. One connection shall watch at most 16 sessions; a `watch` for one more gets `too-many-watches`. The host shall hold at most 1 MiB unsent for one connection and close a phone that reads more slowly, never buffering without limit.

**Error and close.** The host shall answer with one `error` without `replyTo` and close the connection for: a message over 65,519 bytes (`too-large`); a `hello` with a version other than 2 (`unsupported-version`); and as `malformed` bytes that aren't valid UTF-8, text that isn't one JSON object, an unlisted type, a missing, extra or wrongly typed field, an id that breaks the id rule, an `afterSeq` that isn't a whole number from 0 up to the session's `lastSeq`, a prompt outside the length limit, any message before `hello`, and a second `hello`. A well-formed message the host won't carry out gets an `error` with its `replyTo` (`unknown-session`, `unknown-approval`, `not-allowed-remotely`, `history-gone` or `too-many-watches`) and the connection stays open. The phone shall close on a `welcome` whose version isn't 2; there is no negotiation.

**Resume.** Each session's event sequence shall start at 1 and grow by one per event, never reused. A session shall resume after a reconnect by watching from the last sequence the phone saw. When those events are gone the host answers `history-gone`; on that, or on a gap in the sequence, the phone shall drop what it holds for the session and watch from 0, which starts from the oldest event the host keeps. The host shall keep every event from the oldest unsettled `approval-requested`. The phone shall show an approval only from an `approval-requested` not followed by its `approval-settled`, and an answer to a settled or unknown approval gets `unknown-approval`.

**Remote approvals.** Only the host shall set an approval's risk; `answer-approval` carries none. Every answer to a `risky` approval shall get `not-allowed-remotely` unless the person has allowed remote answers to risky approvals for this host on the desktop: refused is the default. The phone's biometric unlock is the phone's own check, and the host shall not treat it as proof.

## Examples

- Given the messages a phone may send,
  when their types are listed,
  then they are exactly `hello`, `list-sessions`, `watch`, `unwatch`, `answer-approval` and `prompt`.
- Given the messages the host may send,
  when their types are listed,
  then they are exactly `welcome`, `sessions`, `event`, `ok`, `error`, `paired`, `pair-refused` and `not-paired`.
- Given the protocol,
  when its version and limit are read,
  then it is version 2 and a message is at most 65,519 bytes.
- Given a `pair-refused` inside the session,
  when it is compiled with a reason other than `denied` or `timed-out`,
  then it doesn't compile.
- Given a phone message that asks to run a shell command or read a secret,
  when it is compiled,
  then it doesn't compile.
- Given a `prompt` of 10,000 code units, each a control character that JSON writes in six bytes, and ids of 128 characters,
  when its size is checked,
  then it fits in one message.
- Given a `prompt` of 16,000 such control characters,
  when its size is checked,
  then it is larger than one message, which is why the limit is 10,000.
- Given an error that closes the connection (`malformed`, `too-large` or `unsupported-version`),
  when it is compiled with a `replyTo`,
  then it doesn't compile.
- Given a refusal that leaves the connection open, such as `not-allowed-remotely`,
  when it is compiled without a `replyTo`,
  then it doesn't compile.
- Given an `answer-approval`,
  when it is compiled with a `risk` field,
  then it doesn't compile.
