# kit.chat-action-waits

- Status: active
- Since: unreleased
- Source: HAL-17334 (T14 PR 7b); states D5 and D6 (HAL-5896); Liam's review of halonic#5614

When a chat line's button action is given `unavailable` with the id of a visible reason, the kit's `ChatEndLine` and `ChatBoxLine` shall keep the button in its place, point it at that reason and not call its `onClick` when it is clicked.

## Examples

- Given a `danger` ChatEndLine with Try again waiting on the line "The engine isn't answering. Showing what it said last.",
  when the person clicks Try again,
  then its `onClick` isn't called, and the button names the line as its reason.
