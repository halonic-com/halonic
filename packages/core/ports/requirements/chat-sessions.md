# ports.chat-sessions

- Status: active
- Since: unreleased
- Source: flow-assistant 5.4 (HAL-647); T14 PR plan, PR 2, with Liam's answers Q1 and Q2 (HAL-1307, HAL-16788); HAL-16791

The ports package shall have a `ChatSessions` port (version 1) that lists, loads, saves and deletes the chats of a workspace, by its location, Build and agent chats in one list. A saved chat shall hold its id, its kind (`build` or `agent:<hub>/<id>`), its title, when it was last used, whether it was answering as it was saved, its model and its messages. `list` shall give the chats without their messages, most recently used first, then by id. The port shall only store: it shall have no method that decides what is kept. Every adapter shall pass the `contracts.chat-sessions` suite.

The port's documentation shall state that chats live in the user's profile and never in a workspace, and that a chat that can't be read is left out of `list`, gives `null` from `load` and is still removed by `delete`.

The ports package shall export `savedChatIdPattern`, 1 to 64 lowercase letters, digits and `-` starting with a letter or digit, so an adapter may use an id as a file name, and `isSavedChat(value)`, which is true only for a value with every field of a saved chat with its type, an id that matches the pattern, a known kind and model, and messages that each have a known role and text content.

## Examples

- Given the `ChatSessions` port,
  when its methods are read,
  then they are exactly `list`, `load`, `save` and `delete`.
- Given a saved chat with the id `../acme` or `C-1`,
  when `isSavedChat` checks it,
  then it is false.
- Given a saved chat of kind `agent:` with nothing after it, or a message with the role `robot`,
  when `isSavedChat` checks it,
  then it is false.
