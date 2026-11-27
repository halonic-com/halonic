# ports.remote-gateway-protocol

- Status: active
- Since: unreleased
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5684. Version 2: tunnel phase B, task HAL-12235, ADR "Pairing and the end-to-end session". Version 3: `answersRisky` and the pushed list, task HAL-16969, decided on HAL-16973. Version 4: the Inbox, Messenger and team status from the phone, board approval of the phase 2 card on HAL-17544, task HAL-17634. Version 5: message reactions, the board's yes on HAL-19139 (26 Nov), build plan approved by Liam on HAL-19139

The remote gateway protocol (message version 5) shall carry only sessions, their events, approvals, prompt input, the end of a pairing, and the Inbox, Messenger, message reactions and team status, and every message shall run inside the end-to-end session (`ports.remote-gateway-session`), never in cleartext. A phone shall send `hello`, `list-sessions`, `watch`, `unwatch`, `answer-approval`, `prompt`, `msg-read`, `msg-search`, `msg-answer`, `msg-send`, `msg-react`, `msg-watch`, `msg-unwatch` and `team-read`, and nothing else; the host shall send `welcome`, `sessions`, `event`, `ok`, `error`, `paired`, `pair-refused`, `not-paired`, `msg-data`, `msg-result`, `msg-changed` and `team-data`.

**Inbox, Messenger and team status.** A `msg-answer` shall carry `confirmed: true`, which the phone sends only after its owner check passed for that answer; the host shall not treat it as proof, and shall refuse an answer to a risky item with `not-allowed-remotely` as it does a risky approval. A phone shall never send an action item's stepper result, start, join or leave a channel, or change its members. Every `msg-data` and `team-data` shall fit one message: a list that doesn't is cut into pages, and a page with items left carries `more`, a cursor the phone hands back to read on. The refusals `not-allowed-from-phone`, `offline`, `signed-out`, `not-found` and `not-supported` leave the connection open; a write is never queued. Since version 5, a `msg-read` of `reactions` reads a conversation's reactions in pages, one item per message that has any, and a `msg-react` adds or removes only the person's own reaction, one of the six emoji, on a message of that conversation.

**Pairing and reconnecting.** At the end of a pairing the host shall send `paired` once the person pressed Allow, or `pair-refused` with `denied` or `timed-out` and close. After a reconnect the host shall send `not-paired` and close when it doesn't know the phone's key, only after its handshake message has proved who it is; it shall also send it at once to a phone revoked while connected. The phone's first message after `paired`, or after a reconnect the host accepts, shall be `hello`.

**Limits.** No message shall be larger than 65,519 bytes of UTF-8 JSON (one Noise transport message less its tag), checked before parsing. No prompt or `msg-send` body shall be empty or longer than 10,000 code units, and no `msg-search` text longer than 200; so a valid prompt fits even when every unit takes six bytes in JSON. Every id shall be 1 to 128 characters from `A`–`Z`, `a`–`z`, `0`–`9`, `_` and `-`, except a messaging id (an Inbox item, a conversation, an addressee or a pull request), which shall follow `gatewayMessagingIdPattern`: 1 to 256 characters that `encodeURIComponent` leaves as they are, plus `%` and `:`. One connection shall watch at most 16 sessions; a `watch` for one more gets `too-many-watches`. The host shall hold at most 1 MiB unsent for one connection and close a phone that reads more slowly, never buffering without limit.

**Error and close.** The host shall answer with one `error` without `replyTo` and close the connection for: a message over 65,519 bytes (`too-large`); a `hello` with a version other than 5 or 4 (`unsupported-version`); and as `malformed` bytes that aren't valid UTF-8, text that isn't one JSON object, an unlisted type, a missing, extra or wrongly typed field, an id that breaks the id rule, an `afterSeq` that isn't a whole number from 0 up to the session's `lastSeq`, a prompt, body or search text outside its length limit, a `msg-answer` without `confirmed: true`, an answer that is neither an option nor a reply, any message before `hello`, a second `hello`, and a reactions message after a version 4 `hello`. A well-formed message the host won't carry out gets an `error` with its `replyTo` (`unknown-session`, `unknown-approval`, `not-allowed-remotely`, `history-gone` or `too-many-watches`) and the connection stays open. The host shall answer a version 5 or 4 `hello` with a `welcome` of that version, so a version 4 phone keeps its Inbox and Messenger, without reactions. The phone shall close on a `welcome` whose version isn't its own `hello`'s. A phone that gets `unsupported-version` shall say `hello` on the next session with the next older version, 5 then 4 then 3, one step per session and only on the session right after the refusal, and start again from 5 on any other session; at version 4 it offers everything but reactions, and at version 3, for one release, only Agents. The message version is not the session version the Noise prologue names (`ports.remote-gateway-session`), so peers of different message versions still connect and the phone can show that an update is needed.

**Session list.** Every `sessions` shall carry `answersRisky`: whether the person's "Let phones answer risky approvals" switch was on when the host made the list. It is only a hint for what the phone shows, never a grant. A `sessions` with `replyTo` answers a `list-sessions`. When the person turns the switch on or off, the host shall send every connection past `welcome` the full list again, without `replyTo`. The phone shall replace its list with each one, and drop a list without `replyTo` that comes before `welcome`.

**Resume.** Each session's event sequence shall start at 1 and grow by one per event, never reused. A session shall resume after a reconnect by watching from the last sequence the phone saw. When those events are gone the host answers `history-gone`; on that, or on a gap in the sequence, the phone shall drop what it holds for the session and watch from 0, which starts from the oldest event the host keeps. The host shall keep every event from the oldest unsettled `approval-requested`. The phone shall show an approval only from an `approval-requested` not followed by its `approval-settled`, and an answer to a settled or unknown approval gets `unknown-approval`.

**Remote approvals.** Only the host shall set an approval's risk; `answer-approval` carries none. Every answer to a `risky` approval shall get `not-allowed-remotely` unless the person has allowed remote answers to risky approvals for this host on the desktop: refused is the default. The phone's biometric unlock is the phone's own check, and the host shall not treat it as proof. The host shall read the switch again for every answer, whatever `answersRisky` the phone last saw.

## Examples

- Given the messages a phone may send,
  when their types are listed,
  then they are exactly `hello`, `list-sessions`, `watch`, `unwatch`, `answer-approval` and `prompt`.
- Given the messages the host may send,
  when their types are listed,
  then they are exactly `welcome`, `sessions`, `event`, `ok`, `error`, `paired`, `pair-refused` and `not-paired`.
- Given the protocol,
  when its version and limit are read,
  then it is message version 5, the host speaks 5 and 4, a phone steps down from 5 to 4 to 3, and a message is at most 65,519 bytes.
- Given a version 5 phone and a computer that speaks only version 4,
  when the computer closes on the phone's version 5 `hello`,
  then the phone says `hello` with version 4 on the next session, keeps its Inbox and Messenger, and sends no reactions message.
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
- Given a `sessions` message,
  when it is compiled without `answersRisky`,
  then it doesn't compile; with or without `replyTo`, it compiles.
- Given a `msg-read`, `msg-answer`, `msg-send` or `team-read` with a key its type doesn't list, or a `type` the protocol doesn't list, such as `msg-start-channel`,
  when the host parses it,
  then it is `malformed`.
- Given a `msg-answer` without `confirmed: true`,
  when it is compiled or parsed,
  then it doesn't compile and the host reads it as `malformed`.
- Given a list whose items don't fit in one message,
  when the host sends it,
  then it sends the longest first page that fits, with `more` naming where to read on.
