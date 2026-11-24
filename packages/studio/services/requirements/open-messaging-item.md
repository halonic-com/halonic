# services.open-messaging-item

- Status: active
- Since: unreleased
- Source: HAL-17500, part of HAL-17422 (Phase 1, a clicked notification opens its item)

When the Studio is asked to open an agent item by its `MessagingId`, such as the one a clicked notification names, it shall select that item in the Inbox and show the Inbox. It shall never answer an item or send a message while doing so. While the Messenger isn't there, it shall leave a conversation alone and say so; when the window has no Inbox, it shall say so too.

## Examples

- Given the Inbox item `item-acme-7`,
  when the Studio is asked to open it,
  then the Inbox shows with `item-acme-7` selected, and nothing is answered or sent.
- Given the conversation `chat-acme-2` and no Messenger,
  when the Studio is asked to open it,
  then nothing changes and the answer is `no-messenger`.
