# paperclip.board-post-guards

- Status: active
- Since: unreleased
- Source: board posts moved done tasks back to `todo` and woke their holder, one task 37 times in a day, and the rule that nobody posts in the board's own chats was a convention only (HAL-20168)

When the board's `POST /board/post` targets a task that is `done` or `cancelled`, the plugin shall post the message, leave the task's status as it is, not wake its assignee, and answer 200 with `woke: false` and a note saying it posted only. When it targets a task whose identifier is in `chiefLine.noPostTasks` (case does not matter; `HAL-10` and `HAL-45` when the setting is missing) or whose title starts with `Chat with `, the plugin shall answer 403, post nothing, wake nobody and not count the call against `chiefLine.maxPerHour`.

## Examples

- Given task ACME-1 assigned to Ravi and `done`,
  when the board posts "fyi",
  then the comment `Board: fyi` is on ACME-1, ACME-1 is still `done`, Ravi isn't woken, and the answer is 200 with `woke: false`.
- Given `noPostTasks` `["ACME-1"]`,
  when the board posts on ACME-1, by its identifier or its id,
  then the plugin answers 403 and ACME-1 has no new comment.
- Given task ACME-1 titled "Chat with Liam",
  when the board posts on it,
  then the plugin answers 403, ACME-1 has no new comment and nobody is woken.
