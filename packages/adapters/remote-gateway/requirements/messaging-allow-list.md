# remote-gateway.messaging-allow-list

- Status: active
- Since: unreleased
- Source: architecture note section 2.3 on HAL-17511 (Julian's P1, P2 and P5, HAL-17540); plan approved on HAL-18874

The remote gateway shall serve a phone's Inbox, Messenger and team-status messages only through a dispatcher table from each version 4 message type to one member of the host's `PhoneMessaging` view, and shall reach the host's agent ports through nothing else. It shall close the connection with `malformed` on any other type, a port member's name included, before anything is called. When the host gives it no view, it shall refuse every version 4 message with `not-supported`. It shall answer an inbox item only after reading the item again from the view: an unknown item gets `not-found`, a `risky` one gets `not-allowed-remotely` unless the person's "Let phones answer risky approvals" switch is on when the answer comes, and an item whose source is offline or signed out gets `offline` or `signed-out` without the answer reaching the provider. It shall refuse a `msg-send` whose `to` names anyone outside the conversation with `not-allowed-from-phone` before the provider is called, and send with no attachments. It shall refuse a search or a send over the paired phone's rate with `rate-limited`, before the provider is called. A `team-read` of one `pull-request` counts against the phone's reactions reads, the other read the host doesn't cache, and one over that rate gets `rate-limited` before the pull request is read. Each refusal shall have its own code; a port's `offline`, `signed-out`, `not-found` and `not-supported` reach the phone as that code.

## Examples

- Given a connected phone,
  when it sends a message whose type is `startChannel`, `agentSpend` or any port member's name,
  then the connection closes with `malformed` and the view is never called.
- Given an inbox item whose source is offline,
  when the phone answers it,
  then it gets `offline` and the provider's `answer` is never called.
- Given a `risky` item and the switch off,
  when the phone answers it,
  then it gets `not-allowed-remotely`.
- Given a channel of Ada and Bo,
  when the phone sends to Cy,
  then it gets `not-allowed-from-phone` and nothing is sent.
- Given a phone that used up its searches,
  when it searches again,
  then it gets `rate-limited` and the search isn't made.
- Given a phone that used up its reactions reads,
  when it reads one pull request,
  then it gets `rate-limited` and the pull request isn't read.
