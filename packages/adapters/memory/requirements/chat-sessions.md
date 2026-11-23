# memory.chat-sessions

- Status: active
- Since: unreleased
- Source: T14 PR plan, PR 2 (HAL-1307); `ChatSessions` port v1; HAL-16791

The memory chat store shall keep each chat as JSON text, so that every read gives a fresh copy, and pass the `contracts.chat-sessions` suite. For tests, `damage(location, id)` shall make that chat unreadable; `damage` on a chat that isn't there shall throw, naming the chat and its workspace, and create nothing. A chat that isn't a valid saved chat shall be treated as unreadable.

## Examples

- Given an empty memory chat store,
  when chat `c-1` of `/workspaces/acme` is damaged,
  then it throws naming `c-1` and `/workspaces/acme`, and loading `c-1` still gives `null`.
- Given a saved chat whose messages were later stored without their content,
  when it is loaded,
  then it is `null`.
