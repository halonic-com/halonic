# contracts.chat-sessions

- Status: active
- Since: unreleased
- Source: flow-assistant 5.4 (HAL-647); Liam's change on HAL-1967 (each new port gets a contract suite); `ChatSessions` port v1; HAL-16791; `about`, HAL-18051

Where an adapter implements `ChatSessions`, it shall start empty; give back every field of a saved chat, including tool calls, a provider's replay and the item a Build chat is about, which `list` gives too; read a chat saved without an `about`; list chats without their messages, most recently used first (comparing times as times) and then by id; replace a chat saved again with the same id; delete a chat, treating the deletion of a missing one as no error; keep what was saved whatever the caller later does with the objects it passed or got; refuse to save a chat whose id doesn't match `savedChatIdPattern` with a `RangeError`, and find nothing under such an id; keep each workspace's chats apart, comparing locations exactly; and leave a chat that can't be read out of `list`, give `null` for it from `load`, while `save` and `delete` still work.

## Examples

- Given an empty store,
  when the chats of `/workspaces/acme` are listed,
  then the list is empty.
- Given chats `a` and `b` last used at 10:00 and `c` at 11:00,
  when they are listed,
  then the order is `c`, `a`, `b`.
- Given chat `c-1` in `/workspaces/acme`,
  when `c-1` in `/workspaces/acme/` is loaded,
  then it is `null`.
- Given chat `c-1` is damaged,
  when the chats are listed,
  then `c-1` isn't among them; and when it is deleted, it is gone.
