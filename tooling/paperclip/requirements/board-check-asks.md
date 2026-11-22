# paperclip.board-check-asks

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 2 (22 Nov); the board ask pattern of the Board Checker's `sv.cjs`

When a comment is created, and every 10 minutes for the open tasks active in the last 12 minutes, the Agent tools plugin's board check shall treat as a board ask each agent's comment from the last 12 minutes that matches the Board Checker's board ask pattern, except the Board Checker's own comments, Paperclip's fast-response receipts, comments carrying "Board check (plugin)", the Merger's comments on HAL-14388 and comments whose id it already handled; when it finds at least one new ask, it shall update the `board-asks` document on the Board Checker's task with the last 24 hours' asks (task, comment id, author, time and link, no text from the comment), wake the Board Checker once for the batch, and remember each ask by its comment id for 7 days.

## Examples

- Given Mateo's comment "This needs the board's yes on the card" on HAL-16003 two minutes ago,
  when Paperclip reports the comment,
  then the plugin updates `board-asks` with HAL-16003, the comment id, Mateo and the time, and wakes the Board Checker's task once.
- Given the same comment reported again, and the job's catch-up pass after it,
  when they run,
  then the plugin writes nothing more.
- Given two new asks on two tasks found by one catch-up pass,
  when it runs,
  then the plugin updates the document once and wakes the Board Checker once.
- Given asks written by the board, by the Board Checker, by the plugin, as a fast-response receipt, by the Merger on HAL-14388, or 13 minutes ago,
  when the plugin looks at them,
  then none of them is an ask; the Merger's ask on another task is.
- Given settings without the Board Checker's task,
  when the job runs,
  then the plugin reads nothing and writes nothing for that company.
