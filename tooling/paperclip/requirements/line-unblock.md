# paperclip.line-unblock

- Status: active
- Since: unreleased
- Source: Chief links its follow-up tasks as blockers on its chief-line thread (HAL-18461 blocking HAL-18422), the host then refuses to wake a task with unresolved blockers, and the line goes silent

When the plugin wakes the agent on a chief-line or `[line]` thread it keeps among its line threads (a send, or a human's comment there), the plugin shall first remove every blocked-by link on that thread and log the removed blockers, then wake the agent. When the board's `POST /board/post` targets any other task that has blockers that are not `done` or `cancelled`, the plugin shall still post the message, leave the task, its status and its blockers as they are, not wake it, and answer 409 naming the blockers.

## Examples

- Given `sup`'s chief line ACME-1, blocked by Chief's follow-up ACME-2 (`todo`),
  when `sup` sends a message,
  then the link to ACME-2 is removed, one info line names ACME-2, and Chief is woken.
- Given an ordinary task ACME-1 assigned to Ravi and blocked by ACME-2 (`in_progress`),
  when the board posts on it,
  then the post is made, ACME-1 stays blocked by ACME-2, nobody is woken, and the answer is 409 "… blocked by ACME-2, not woken …".
