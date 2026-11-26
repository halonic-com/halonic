# paperclip-client.shared-reads

- Status: active
- Since: unreleased
- Source: HAL-19822 (the Messenger reads every chat at once; each read asked Paperclip whom the key belongs to, so 15 chats sent 15 `GET /api/cli-auth/me`)

While the Paperclip provider's read of whom its key belongs to (`paperclip-client.own-messages`), or of the company's agents for mapping messages, is under way, every other read that needs it shall wait for that read and send no request of its own. Once the read has answered, a later read shall follow the rules it had before: the user is read again only while no read gave a final answer, and the agents only while none are known.

## Examples

- Given a connection made with no user, and 15 chats,
  when the Messenger reads the 15 chats' messages at once,
  then Paperclip gets one `GET /api/cli-auth/me` and one `GET /api/companies/:company/agents`.
