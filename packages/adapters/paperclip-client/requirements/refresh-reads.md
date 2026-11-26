# paperclip-client.refresh-reads

- Status: active
- Since: unreleased
- Source: Julian's review of the server's messaging poll loop (HAL-19493), follow-up HAL-19584

When the Paperclip provider's `refresh` ends, it shall keep the agents (when it read them), the chats and channels, the Inbox, the work and the channels to browse that it read, and the next read of each of those lists shall answer from what it kept, without a request to Paperclip, when made within 10 seconds of that `refresh`. Each kept list shall answer one read only. A write (a send, an answer, starting a channel, changing its members, joining or leaving it, or revoking the key) shall forget what was kept, also when it starts while a `refresh` is in progress, so a list read made after a write reads Paperclip again.

## Examples

- Given a `refresh` just ended, when the server's poll loop reads its six lists,
  then each Paperclip request of that poll is sent once.
- Given a `refresh` just ended and a message was sent since, when the chats are listed,
  then the open tasks and the chats are read from Paperclip again.
- Given a `refresh` ended 11 seconds ago, when the work is listed,
  then the open tasks are read from Paperclip again.
- Given the work was listed once after a `refresh`, when it is listed again,
  then the open tasks are read from Paperclip again.
