# paperclip-client.read-receipts

- Status: active
- Since: unreleased
- Source: the board's Messenger request for read receipts (HAL-18736, 25 Nov); rule approved by the maintainer on HAL-18736

When the Paperclip provider lists a chat's messages and the person has a message there, it shall read the chat task's runs (`GET /api/issues/:task/runs`) and set each of the person's messages' `readAt` to the start of the first run of the chat's agent on that task that has started and either lists the message among the comments that woke it or started after the message was sent. A queued run, or another agent's run, shall never set `readAt`. Only the person's own messages shall carry `readAt`. When Paperclip doesn't answer that read, the messages shall carry no `readAt`. No run's logs, errors or wake text shall be kept.

## Examples

- Given a started run of the chat's agent that lists the person's message among the comments that woke it,
  when the messages are listed,
  then the message's `readAt` is that run's start.
- Given only a queued run that lists the message,
  when the messages are listed,
  then the message has no `readAt`.
