# paperclip.board-post

- Status: active
- Since: unreleased
- Source: the board's request to post on any task without the Supervisor user as the author, whose seats break the runs it starts

While the chief line is on, when a signed-in board user calls the Agent tools plugin's `POST /board/post` with `{issue, message}` (a task identifier or id in the route's company, and a non-empty message of at most 8000 characters), the plugin shall post `Board: <message>` on the task as the plugin itself, with no human author, and wake the task's assignee agent the same way the chief line wakes Chief, at most `chiefLine.maxPerHour` posts in the last hour (429 above it). The plugin shall answer 404 for a task it can't find in the company, 409 for a task with no assignee agent, and refuse an agent's key.

## Examples

- Given task ACME-1 assigned to Ravi,
  when the board posts "please rebase",
  then the plugin's comment `Board: please rebase` has no author and Ravi is woken.
- Given `maxPerHour` 3,
  when the board posts four times within an hour,
  then the fourth is refused with 429.
