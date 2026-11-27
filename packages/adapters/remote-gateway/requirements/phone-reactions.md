# remote-gateway.phone-reactions

- Status: active
- Since: unreleased
- Source: HAL-19139 (message reactions, the board's yes on 26 Nov; build plan approved by Liam on HAL-19139, with the condition that a phone and a host of different versions lose only reactions, never the chat)

The remote gateway shall, from message version 5, serve a phone's `msg-read` of `reactions` and its `msg-react` only for a conversation the host's `PhoneMessaging` view lists, read again for each message, and refuse any other conversation with `not-found` before the reactions are read or changed. It shall send a conversation's reactions as `msg-data` pages, one item per message that has any. It shall add or remove only the person's own reaction, only on a message of that conversation (`not-found` otherwise, before the provider is called), only with one of the six emoji (`malformed` otherwise), and it shall count each one against the paired phone's sends, refusing one over the rate with `rate-limited`. When the view has no reactions, it shall refuse both with `not-supported` and keep the connection. On a connection whose `hello` named version 4, it shall close with `malformed` on either message, and serve the version 4 messages as before.

## Examples

- Given a conversation with a 👍 on its first message,
  when a version 5 phone reads its reactions,
  then it gets one page with one item for that message.
- Given a message that isn't in the conversation,
  when the phone reacts to it,
  then it gets `not-found` and the provider isn't called.
- Given a phone that used up its sends,
  when it reacts,
  then it gets `rate-limited`.
- Given a host whose view keeps no reactions,
  when the phone reads them,
  then it gets `not-supported` and the connection stays open.
- Given a phone that said `hello` with version 4,
  when it sends `msg-react`,
  then the connection closes with `malformed`.
