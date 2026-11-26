# Decision: a feedback is sent only through the connection it was kept for

- Task: HAL-19240
- Approval: Liam asks for this change in his review of #6541 and #6545 on HAL-19240 (https://paperclip.halonic.com/HAL/issues/HAL-19240#comment-72a25c0f-f9fa-4f91-a0c5-c6f3f8a96e7d), after approving the plan on HAL-19671. A team decision with no board card (HAL-2282 rule).
- Kind: internal

## What changes

The requirement `studio.feedback-sender` said the app sends a feedback through the folder's first
Paperclip connection that holds its key. It now says the app sends it through the one connection
the feedback was kept for, and answers `not-connected` when that connection has no key, even while
another of the folder's connections does. When the agent host stops answering while it sends, the
answer is `offline`, as it already was when the host wasn't answering before the send.

The examples and the test for the first signed-in connection are replaced by ones for the named
connection, for a named connection without its key, and for a host that stops answering during the
send. No test was weakened or skipped. The requirement is still unreleased, so no user sees the old
behaviour change.

## Why

Liam's review notes on #6545 and #6541: a waiting feedback must go to the folder and connection it
was written for, never to a connection that signs in later, and `AgentHostNotAnswering` from the
send must count as offline so the feedback is kept rather than lost.

## Covers

- studio.feedback-sender
