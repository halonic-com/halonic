# Decision: the phone protocol goes to version 5 for reactions, and the host still speaks 4

- Task: HAL-19139
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19139 (the board's yes to reactions on desktop and phone, 26 Nov 12:21 UTC; Liam's approval of the build plan, 26 Nov 12:47 UTC, point 2: a phone protocol bump is fine as long as a phone and a host of different versions lose only reactions, never the chat)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DET7vqwSlz2T3N/z5fRaCrgpjROtUPiEdLnY+wAbq14TuLCYbDeomtAszNMSinDNl0MaUWmvM3dkV0a0MRmkCw==

## What changes

The remote gateway's message version goes from 4 to 5. Version 5 adds two
phone messages: a `msg-read` of a conversation's `reactions` and `msg-react`.

- `ports.remote-gateway-protocol`: version 5; the phone may send `msg-react`.
  The host speaks 5 and 4 and answers each `hello` in its own version, so a
  phone not yet updated keeps its Inbox and Messenger. A reactions message
  after a version 4 `hello` is `malformed`. A phone refused with
  `unsupported-version` steps down one version per session, 5, 4, then 3,
  where before it went from 4 to 3.
- `remote.phone-gateway-client`: the same step down, and a version 4
  `welcome` offers everything but reactions.
- `remote.phone-messaging-client`: at version 5 the phone also sends the two
  reactions requests; at version 4 it sends none and settles them as not sent.

The tests that pinned version 4 now pin 5 and the step through 4. Each
version-3 test still checks Agents only, now reached through 5 and 4. In
`tunnel-attacks.frame-attacks`, the list of `hello` versions the host refuses
swaps 5, which it now speaks, for 6, so the test still covers a version just
above the newest one. No
test is skipped or deleted, and no requirement is retired.
`remote-gateway.phone-reactions` is new.

## Why

Reactions must show on the phone too (the board's acceptance test: react on
desktop, then see it on the phone). The phone talks to the host only through
this closed protocol, so it needs new messages, and so a new version. Keeping
version 4 on the host and stepping the phone down through 4 means a phone and
a computer on different releases lose only reactions, as Liam asked.

## Covers

- ports.remote-gateway-protocol
- remote.phone-gateway-client
- remote.phone-messaging-client
