# remote.phone-messaging-client

- Status: draft
- Since: unreleased
- Source: HAL-18898 (phase 2 G3c, architecture note on HAL-17511, sections 2.2 and 2.3; protocol `packages/core/ports/src/remote-gateway-messaging.ts`). Reactions: HAL-19139 (message version 5, build plan approved by Liam)

While the computer speaks message version 4 or 5 and has welcomed the phone, the phone shall send each Inbox and Messenger request (`msg-read` of a list or of a conversation's messages, `msg-search`, `msg-answer`, `msg-send`, `msg-watch` and `msg-unwatch`, and at version 5 also `msg-read` of a conversation's `reactions` and `msg-react`) once, and settle it by the host's `msg-data`, `msg-result` or `ok` that names it, or by the host's refusal (such as `not-allowed-from-phone`, `offline`, `signed-out`, `not-found` or `not-supported`), keeping the connection. It shall read the next page of a list with the `more` of the page before as its cursor. It shall send `msg-answer` only with `confirmed: true`, and the shell lets it out only after the owner check passed. It shall not send a blank or too long search, answer or message, nor a `msg-send` whose `to` names an agent who isn't a member of the conversation. It shall end the session on a `msg-data` with a missing, extra or wrongly typed field, on a `msg-data` or `msg-result` that answers nothing it waits for or doesn't fit what it asked, on a `msg-changed` while it doesn't watch, on a sent message in a `msg-result` whose `id`, `conversation`, `to`, attachment ids or author's `agent` break `gatewayMessagingIdPattern`, on an `already-answered` result whose `by` names an agent whose `agent` breaks it, and on a `msg-changed` whose `source` breaks it. It shall also end the session on a `msg-data` whose `more` breaks the protocol's id rule, the rule the host reads the cursor back by. When the connection drops before the host answers a request, the phone shall settle it as cut off and never send it again; only a watch is asked for again on the next version 4 or 5 session. While the computer speaks only version 4, the phone shall send no reactions request, and settle one as not sent; while it speaks only version 3, the phone shall send none of these requests.

## Examples

- Given a phone welcomed by a version 4 computer,
  when it reads the inbox and the host answers with a page,
  then the phone sent one `msg-read` and has the page's items.
- Given a page of conversations with `more`,
  when the phone reads on,
  then its next `msg-read` carries that `more` as its cursor.
- Given a `msg-send` the host refuses with `offline`,
  when the refusal arrives,
  then the send is refused with `offline` and the connection stays open.
- Given a `msg-data` with a key the protocol doesn't list,
  when the phone reads it,
  then it ends the session.
- Given a `msg-send` waiting for its answer,
  when the connection drops and comes back,
  then the send is cut off and the phone doesn't send it again.
- Given a computer that speaks only message version 3,
  when the screens ask for the inbox,
  then the phone sends nothing.
- Given a phone welcomed by a version 5 computer,
  when it reads a conversation's reactions and adds a 👍,
  then it sent one `msg-read` of `reactions` and one `msg-react`, and has the page's items and the message's reactions after it.
- Given a computer that speaks only message version 4,
  when the screens ask for a conversation's reactions,
  then the phone sends nothing and the request is not sent.
