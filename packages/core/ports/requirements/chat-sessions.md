# ports.chat-sessions

- Status: active
- Since: unreleased
- Source: flow-assistant 5.4 (HAL-647); T14 PR plan, PR 2, with Liam's answers Q1 and Q2 (HAL-1307, HAL-16788); HAL-16791; `about`, HAL-18051; `docs`, HAL-18451

The ports package shall have a `ChatSessions` port (version 1) that lists, loads, saves and deletes the chats of a workspace, by its location, Build and agent chats in one list. A saved chat shall hold its id, its kind (`build` or `agent:<hub>/<id>`), its title, when it was last used, whether it was answering as it was saved, its model and its messages, and a Build chat may also hold the item it's about (`about`: the item's kind, hub and id, never its name); an `agent:` chat says what it's about through its kind. `about` is optional, so a chat saved without it still reads. A Build chat may also hold its `docs`: each docs site it asked about with its host, the person's answer (`asked`, `allowed` or `declined`) and the `read_docs` call whose card asked, and its docs log, each line with the call it is for, the time, the address, the outcome, the status, the bytes read and where a `3xx` pointed; `docs` is optional too. `list` shall give the chats without their messages, but with `about`, most recently used first, then by id. The port shall only store: it shall have no method that decides what is kept. Every adapter shall pass the `contracts.chat-sessions` suite.

The port's documentation shall state that chats live in the user's profile and never in a workspace, and that a chat that can't be read is left out of `list`, gives `null` from `load` and is still removed by `delete`.

The ports package shall export `savedChatIdPattern`, 1 to 64 lowercase letters, digits and `-` starting with a letter or digit, so an adapter may use an id as a file name, and `isSavedChat(value)`, which is true only for a value with every field of a saved chat with its type, an id that matches the pattern, a known kind and model, an `about` (when present) with a known kind and a non-empty hub and id, `docs` (when present) with sites of a non-empty host and a known answer and log lines of a known outcome, and messages that each have a known role and text content.

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
- Given a Build chat with `about: { kind: "workflow", hub: "support", id: "triage" }`,
  when `isSavedChat` checks it,
  then it is true; and with `about` of kind `page` or an empty hub, it is false.
- Given a Build chat with `docs: { sites: [{ host: "docs.example.com", answer: "allowed", cardId: "t2" }], log: [] }`,
  when `isSavedChat` checks it,
  then it is true; and with a site's answer `maybe` or a log line's outcome `fetched`, it is false.
