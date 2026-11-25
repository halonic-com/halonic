# paperclip-client.own-messages

- Status: active
- Since: unreleased
- Source: the board's report on HAL-18736 (a sent message moved to the left once Paperclip confirmed it); the approved Messenger design (HAL-18481, improvement 1)

When the host names no Paperclip user for a connection, the Paperclip provider shall read whom its key belongs to (`GET /api/cli-auth/me`) before it maps a chat's or a channel's messages, or the message it just sent, and shall map a comment whose `authorUserId` is that user's ID as the person's own message (`me`). Once one read gave an ID it shall not read it again; while Paperclip can't be reached, refuses the key or fails on its side, it shall map the messages as it can, with no message as `me`, and read again next time. A user the host names shall be used as it is, with no read.

## Examples

- Given a connection made with no user, whose key belongs to `u-acme-board`,
  when the person sends "On it" to their chat with Ada and Paperclip answers with a comment by `u-acme-board`,
  then the sent message's author is `me`, and so is that comment's when the chat's messages are read again.
- Given the same connection while `GET /api/cli-auth/me` fails with a 500,
  when the chat's messages are read,
  then they are listed with no message as `me`, and the next read asks again.
- Given a connection made for user `u-acme-board`,
  when the chat's messages are read,
  then the person's comments are `me` and no `GET /api/cli-auth/me` is sent.
